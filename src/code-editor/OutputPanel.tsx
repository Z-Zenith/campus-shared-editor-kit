/**
 * SEK-01 — VS Code-styled batch output/Problems panel.
 *
 * NOT a live interactive terminal: the Code Execution Service (Judge0) is a
 * one-shot batch executor — it takes source+stdin upfront and returns
 * stdout/stderr/exit code/duration afterward, with no interactive stdin
 * during a run. This panel presents that batch result in a VS Code-like
 * dark, monospace, scrollback-capable pane, distinguishing a compilation
 * error (Problems) from a plain runtime result (Output) via
 * CodeRunResult.status. Replacing the execution model with a real
 * interactive shell is out of scope.
 */
import { useLayoutEffect, useState } from 'react';
import type { CodeFile, CodeRunResult, TerminalExecResult } from './types.js';
import type { Result, SekError } from '../types/common.js';
import { TerminalPanel } from './TerminalPanel.js';

type PanelTab = 'output' | 'problems' | 'terminal';

interface OutputPanelProps {
  readonly result: CodeRunResult | null;
  readonly error: SekError | null;
  readonly running: boolean;
  readonly files: readonly CodeFile[];
  /** All three optional and only meaningful together — see CodeEditorProps.onTerminalStart. */
  readonly onTerminalStart?: ((files: readonly CodeFile[]) => Promise<Result<{ sessionId: string }, SekError>>) | undefined;
  readonly onTerminalExec?: ((sessionId: string, command: string) => Promise<Result<TerminalExecResult, SekError>>) | undefined;
  readonly onTerminalClose?: ((sessionId: string) => Promise<Result<void, SekError>>) | undefined;
}

export function OutputPanel({ result, error, running, files, onTerminalStart, onTerminalExec, onTerminalClose }: OutputPanelProps) {
  const isProblem =
    result?.status === 'compilation_error' ||
    result?.status === 'internal_error' ||
    (result && !result.status && result.exitCode !== 0);
  const [tab, setTab] = useState<PanelTab>('output');
  // Once opened, the Terminal tab's panel stays mounted (just hidden) when the student
  // switches to Output/Problems, so its sandbox session survives tab switches — only
  // closed on a real unmount (the whole Coding editor going away) or an explicit Restart.
  const [terminalOpened, setTerminalOpened] = useState(false);
  const terminalAvailable = Boolean(onTerminalStart && onTerminalExec && onTerminalClose);

  // Each new run outcome navigates to the tab that actually has something to show,
  // overriding whatever the student had manually clicked on for the *previous* run —
  // otherwise a student who checked Problems after a compile error, then fixed it and
  // re-ran successfully, would stay stuck on a "No problems." Problems tab with their
  // fresh stdout sitting unseen on the Output tab. New errors/warnings should be just
  // as hard to miss, so this also fires for those.
  useLayoutEffect(() => {
    if (result) {
      setTab(isProblem ? 'problems' : 'output');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const activeTab: PanelTab = error ? 'problems' : tab;

  return (
    <div className="sek-code-editor__output-panel">
      <div className="sek-code-editor__output-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'output'}
          data-active={activeTab === 'output'}
          className="sek-code-editor__output-tab"
          onClick={() => setTab('output')}
        >
          Output
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'problems'}
          data-active={activeTab === 'problems'}
          className="sek-code-editor__output-tab"
          onClick={() => setTab('problems')}
        >
          Problems
          {(isProblem || error) && <span className="sek-code-editor__output-tab-badge">!</span>}
        </button>
        {terminalAvailable && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'terminal'}
            data-active={activeTab === 'terminal'}
            className="sek-code-editor__output-tab"
            onClick={() => {
              setTerminalOpened(true);
              setTab('terminal');
            }}
          >
            Terminal
          </button>
        )}
      </div>
      <div className="sek-code-editor__output-body">
        {activeTab !== 'terminal' && (
          <>
            {running && (
              <div className="sek-code-editor__output-status">
                <span className="sek-code-editor__spinner" aria-hidden="true" />
                Running…
              </div>
            )}
            {!running && !result && !error && (
              <div className="sek-code-editor__output-empty">Run (F5) to see output here.</div>
            )}
            {error && (
              <pre className="sek-code-editor__problems" role="alert">
                {error.message}
              </pre>
            )}
            {!error && result && activeTab === 'output' && (
              <>
                <pre className="sek-code-editor__stdout">{result.stdout || '(no output)'}</pre>
                {result.stderr && !isProblem && <pre className="sek-code-editor__stderr">{result.stderr}</pre>}
                <div className="sek-code-editor__meta" data-outcome={result.exitCode === 0 ? 'ok' : 'fail'}>
                  <span className="sek-code-editor__meta-icon" aria-hidden="true">
                    {result.exitCode === 0 ? '✓' : '✕'}
                  </span>
                  exit {result.exitCode} · {result.durationMs}ms
                  {result.timedOut ? ' · timed out' : ''}
                </div>
              </>
            )}
            {!error && result && activeTab === 'problems' && (
              <>
                {isProblem ? (
                  <pre className="sek-code-editor__problems">{result.stderr || '(no diagnostic output)'}</pre>
                ) : (
                  <div className="sek-code-editor__output-empty">No problems.</div>
                )}
                <div className="sek-code-editor__meta" data-outcome={isProblem ? 'fail' : 'ok'}>
                  {result.status ?? (result.exitCode === 0 ? 'accepted' : 'runtime_error')}
                </div>
              </>
            )}
          </>
        )}
        {terminalAvailable && terminalOpened && (
          <div className="sek-code-editor__terminal-wrap" hidden={activeTab !== 'terminal'}>
            <TerminalPanel
              files={files}
              onTerminalStart={onTerminalStart!}
              onTerminalExec={onTerminalExec!}
              onTerminalClose={onTerminalClose!}
              active={activeTab === 'terminal'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
