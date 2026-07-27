/**
 * SDA-19 — SEK-03 host entry for the Student Desktop App.
 *
 * Not part of the public SEK interface (see ../index.ts) — this is glue that
 * bootstraps NotesEditor inside an Avalonia NativeWebView. Bundled standalone
 * via `npm run build:host` (esbuild), never imported by TWA/SDA as a module.
 *
 * Bridge protocol: SEK's callback props post a `{ requestId, method, payload }`
 * message to the host (C#) via the WebView2-style `window.chrome.webview.postMessage`
 * API that Avalonia's NativeWebView exposes on every platform. The host resolves the
 * pending promise by calling `window.__sekHostReceive(json)` back via InvokeScript.
 * Auth/API calls live entirely on the C# side — this file never sees a session token.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NotesEditor, extractOutgoingLinks } from '../index.js';
import type { Note, NotesEditorProps } from '../notes/types.js';
import type { Result, SekError, UserContext } from '../types/common.js';

type BridgeMethod = 'save' | 'delete' | 'resolveLink' | 'listBacklinks';

interface HostRequest {
  readonly requestId: string;
  readonly method: BridgeMethod;
  readonly payload: unknown;
}

interface HostResponse {
  readonly requestId: string;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: SekError;
}

interface MountMessage {
  readonly user: UserContext;
  readonly currentNote: Note | null;
  readonly canEdit: boolean;
}

declare global {
  interface Window {
    chrome: { webview: { postMessage(message: string): void } };
    __sekHostReceive?: (json: string) => void;
    __sekHostMount?: (json: string) => void;
  }
}

let nextRequestId = 0;
const pendingRequests = new Map<string, (response: HostResponse) => void>();

function callHost<TValue>(method: BridgeMethod, payload: unknown): Promise<Result<TValue, SekError>> {
  const requestId = `${method}-${++nextRequestId}`;
  return new Promise((resolve) => {
    pendingRequests.set(requestId, (response) => {
      resolve(
        response.ok
          ? { ok: true, value: response.value as TValue }
          : {
              ok: false,
              error: response.error ?? { code: 'network_error', message: 'The host did not return a result.' },
            }
      );
    });
    window.chrome.webview.postMessage(JSON.stringify({ requestId, method, payload } satisfies HostRequest));
  });
}

window.__sekHostReceive = (json: string) => {
  const response: HostResponse = JSON.parse(json);
  const resolve = pendingRequests.get(response.requestId);
  if (!resolve) {
    return;
  }
  pendingRequests.delete(response.requestId);
  resolve(response);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('SEK notes host: #root element is missing from host/index.html.');
}
const root: Root = createRoot(rootElement);

// The host (C#) side has no visibility into whether this actually ran — InvokeScript
// doesn't propagate in-page script errors as .NET exceptions, so a thrown error here
// used to fail completely silently, leaving a permanently blank WebView with no error
// shown anywhere. Reporting success/failure explicitly over the same postMessage
// channel `callHost` uses lets SekBridge (C#) know either way.
window.__sekHostMount = (json: string) => {
  try {
    const { user, currentNote, canEdit }: MountMessage = JSON.parse(json);

    const props: NotesEditorProps = {
      user,
      currentNote,
      canEdit,
      onSave: (note) => callHost<Note>('save', { note, links: extractOutgoingLinks(note.contentMarkdown) }),
      onDelete: (noteId) => callHost<void>('delete', { noteId }),
      onResolveLink: (toNoteId) => callHost<Note>('resolveLink', { toNoteId }),
      onListBacklinks: (toNoteId) => callHost<readonly Note[]>('listBacklinks', { toNoteId }),
    };

    root.render(createElement(NotesEditor, props));
    window.chrome.webview.postMessage(JSON.stringify({ type: 'sekHostMounted' }));
  } catch (error) {
    window.chrome.webview.postMessage(
      JSON.stringify({ type: 'sekHostMountFailed', message: String(error) })
    );
  }
};
