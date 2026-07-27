/**
 * SEK-01 follow-up — integrated terminal panel.
 *
 * NOT a live pty-backed shell: same reasoning as OutputPanel's own doc comment for Run,
 * applied here. A real streaming terminal (arrow-key line editing, colors from
 * interactive readline, full-screen apps like vim/htop) needs real pty allocation and a
 * continuous bidirectional transport, which this app's WebView-never-talks-to-the-
 * network-directly architecture makes a much larger, riskier build than what a student
 * actually needs: type a command, see its output. One command runs at a time,
 * request/response, against a persistent sandbox container the embedder starts on this
 * panel's behalf (see CodeEditorProps.onTerminalStart doc comment).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result, SekError } from '../types/common.js';
import type { CodeFile, TerminalExecResult } from './types.js';

interface TerminalPanelProps {
  readonly files: readonly CodeFile[];
  readonly onTerminalStart: (files: readonly CodeFile[]) => Promise<Result<{ sessionId: string }, SekError>>;
  readonly onTerminalExec: (sessionId: string, command: string) => Promise<Result<TerminalExecResult, SekError>>;
  readonly onTerminalClose: (sessionId: string) => Promise<Result<void, SekError>>;
  /** Whether the Terminal tab is the one currently visible — controls autofocus only; the panel stays mounted (and its session alive) when a different tab is active. */
  readonly active: boolean;
}

interface LogEntry {
  readonly kind: 'command' | 'output' | 'error';
  readonly text: string;
}

export function TerminalPanel({ files, onTerminalStart, onTerminalExec, onTerminalClose, active }: TerminalPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);

  // Callbacks/files are supplied fresh every render by the embedder; the effects below
  // only want the latest value at the moment they actually fire (session start, command
  // exec, unmount), not to re-run whenever the embedder happens to re-render.
  const filesRef = useRef(files);
  filesRef.current = files;
  const onTerminalStartRef = useRef(onTerminalStart);
  onTerminalStartRef.current = onTerminalStart;
  const onTerminalCloseRef = useRef(onTerminalClose);
  onTerminalCloseRef.current = onTerminalClose;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const startSession = useCallback(async () => {
    setStarting(true);
    const outcome = await onTerminalStartRef.current(filesRef.current);
    setStarting(false);
    if (outcome.ok) {
      setSessionId(outcome.value.sessionId);
    } else {
      setLog((prev) => [...prev, { kind: 'error', text: outcome.error.message }]);
    }
  }, []);

  // Starts lazily on first mount (OutputPanel only mounts this panel once the student
  // actually opens the Terminal tab) and closes on unmount — which happens both when the
  // whole Coding editor unmounts and, deliberately, never just from switching tabs
  // (OutputPanel keeps this panel mounted-but-hidden once opened, so the session
  // survives tab switches).
  useEffect(() => {
    void startSession();
    return () => {
      const id = sessionIdRef.current;
      if (id) void onTerminalCloseRef.current(id);
    };
  }, [startSession]);

  const runCommand = async () => {
    const cmd = command.trim();
    const id = sessionId;
    if (!cmd || !id || running) return;
    setCommand('');
    setLog((prev) => [...prev, { kind: 'command', text: cmd }]);
    setRunning(true);
    const outcome = await onTerminalExec(id, cmd);
    setRunning(false);
    if (outcome.ok) {
      const text = [outcome.value.stdout, outcome.value.stderr].filter(Boolean).join('') || '(no output)';
      setLog((prev) => [...prev, { kind: outcome.value.exitCode === 0 ? 'output' : 'error', text }]);
    } else {
      setLog((prev) => [...prev, { kind: 'error', text: outcome.error.message }]);
    }
  };

  // Picks up file changes made since the session started — the workspace is
  // materialized once at session start, not live-synced from Monaco edits.
  const restart = async () => {
    const id = sessionId;
    setSessionId(null);
    setLog([]);
    if (id) await onTerminalCloseRef.current(id);
    await startSession();
  };

  return (
    <div className="sek-code-editor__terminal">
      <div className="sek-code-editor__terminal-toolbar">
        <button
          type="button"
          className="sek-code-editor__terminal-restart"
          onClick={() => void restart()}
          disabled={starting}
          title="Restart sandbox (picks up file changes since it started)"
        >
          ↻ Restart
        </button>
      </div>
      <div className="sek-code-editor__terminal-log">
        {log.map((entry, i) =>
          entry.kind === 'command' ? (
            <div key={i} className="sek-code-editor__terminal-entry sek-code-editor__terminal-entry--command">
              <span className="sek-code-editor__terminal-prompt">student@sandbox:/box$</span> {entry.text}
            </div>
          ) : (
            <pre
              key={i}
              className={`sek-code-editor__terminal-entry sek-code-editor__terminal-entry--${entry.kind}`}
            >
              {entry.text}
            </pre>
          )
        )}
        {starting && <div className="sek-code-editor__terminal-status">Starting sandbox…</div>}
      </div>
      <div className="sek-code-editor__terminal-input-row">
        <span className="sek-code-editor__terminal-prompt">student@sandbox:/box$</span>
        <input
          className="sek-code-editor__terminal-input"
          value={command}
          disabled={!sessionId || running}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runCommand();
          }}
          placeholder={sessionId ? 'Type a command…' : 'Waiting for sandbox…'}
          autoFocus={active}
        />
      </div>
    </div>
  );
}
