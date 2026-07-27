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
import { useState } from 'react';
import type { CodeRunResult } from './types.js';
import type { SekError } from '../types/common.js';

type PanelTab = 'output' | 'problems';

interface OutputPanelProps {
  readonly result: CodeRunResult | null;
  readonly error: SekError | null;
  readonly running: boolean;
}

export function OutputPanel({ result, error, running }: OutputPanelProps) {
  const isProblem =
    result?.status === 'compilation_error' ||
    result?.status === 'internal_error' ||
    (result && !result.status && result.exitCode !== 0);
  const [tab, setTab] = useState<PanelTab>('output');

  const activeTab: PanelTab = error ? 'problems' : isProblem ? 'problems' : tab;

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
      </div>
      <div className="sek-code-editor__output-body">
        {running && <div className="sek-code-editor__output-status">Running…</div>}
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
            <pre className="sek-code-editor__stdout">{result.stdout}</pre>
            {result.stderr && !isProblem && <pre className="sek-code-editor__stderr">{result.stderr}</pre>}
            <div className="sek-code-editor__meta">
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
            <div className="sek-code-editor__meta">
              {result.status ?? (result.exitCode === 0 ? 'accepted' : 'runtime_error')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
