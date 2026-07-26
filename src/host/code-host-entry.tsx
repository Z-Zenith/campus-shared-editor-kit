/**
 * SDA — SEK-01 host entry for the Student Desktop App's Coding app.
 *
 * Not part of the public SEK interface (see ../index.ts) — this is glue that bootstraps
 * CodeEditor inside an Avalonia NativeWebView, mirroring notes-host-entry.tsx's bridge
 * protocol exactly: post a `{ requestId, method, payload }` message to the host (C#) via
 * `window.chrome.webview.postMessage`, which every platform's NativeWebView exposes
 * uniformly. The host resolves the pending promise by calling
 * `window.__sekHostReceive(json)` back via InvokeScript.
 *
 * SEK-01 has one bridged method for this first cut: 'run'. There's no persistence
 * callback yet (no onSave/onLoad) — this is a scratch code-run surface, not a saved-files
 * feature; the embedder is free to add persistence later without touching this protocol.
 * Auth/API calls live entirely on the C# side — this file never sees a session token.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CodeEditor } from '../code-editor/CodeEditor.js';
import type { CodeEditorProps, CodeRunResult, CodeSource } from '../code-editor/types.js';
import type { Result, SekError, UserContext } from '../types/common.js';

type BridgeMethod = 'run';

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
  readonly canRun: boolean;
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
  throw new Error('SEK code host: #root element is missing from host/code-index.html.');
}
const root: Root = createRoot(rootElement);

window.__sekHostMount = (json: string) => {
  const { user, canRun, canEdit }: MountMessage = JSON.parse(json);

  const props: CodeEditorProps = {
    user,
    canRun,
    canEdit,
    defaultLanguage: 'python',
    onRun: (source: CodeSource) => callHost<CodeRunResult>('run', { source }),
  };

  root.render(createElement(CodeEditor, props));
};
