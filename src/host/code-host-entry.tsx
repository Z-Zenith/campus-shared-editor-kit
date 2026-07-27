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
 * SEK-01 has two bridged methods: 'run' and 'save'. Auth/API calls live entirely on the
 * C# side — this file never sees a session token.
 *
 * `./monaco-setup.js` must be imported first (before CodeEditor, which renders a Monaco
 * <Editor>) so the no-CDN loader/worker-URL overrides are installed before anything tries
 * to construct a Monaco worker.
 */
import './monaco-setup.js';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CodeEditor } from '../code-editor/CodeEditor.js';
import type { CodeEditorProps, CodeFile, CodeProject, CodeRunResult, TerminalExecResult } from '../code-editor/types.js';
import type { Result, SekError, UserContext } from '../types/common.js';

type BridgeMethod = 'run' | 'save' | 'terminalStart' | 'terminalExec' | 'terminalClose';

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
  readonly currentProject: CodeProject | null;
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

// The host (C#) side has no visibility into whether this actually ran — InvokeScript
// doesn't propagate in-page script errors as .NET exceptions, so a thrown error here
// used to fail completely silently, leaving a permanently blank WebView with no error
// shown anywhere. Reporting success/failure explicitly over the same postMessage
// channel `callHost` uses lets CodeBridge (C#) know either way.
window.__sekHostMount = (json: string) => {
  try {
    const { user, currentProject, canRun, canEdit }: MountMessage = JSON.parse(json);

    const props: CodeEditorProps = {
      user,
      ...(currentProject ? { initialProject: currentProject } : {}),
      canRun,
      canEdit,
      defaultLanguage: 'python',
      onRun: (project: CodeProject) => callHost<CodeRunResult>('run', { project }),
      onSave: (project: CodeProject) => callHost<CodeProject>('save', { project }),
      onTerminalStart: (files: readonly CodeFile[]) =>
        callHost<{ sessionId: string }>('terminalStart', { files }),
      onTerminalExec: (sessionId: string, command: string) =>
        callHost<TerminalExecResult>('terminalExec', { sessionId, command }),
      onTerminalClose: (sessionId: string) => callHost<void>('terminalClose', { sessionId }),
    };

    root.render(createElement(CodeEditor, props));
    window.chrome.webview.postMessage(JSON.stringify({ type: 'sekHostMounted' }));
  } catch (error) {
    window.chrome.webview.postMessage(
      JSON.stringify({ type: 'sekHostMountFailed', message: String(error) })
    );
  }
};
