/**
 * SEK-01 — Code editor public interface.
 *
 * Spec: docs/Campus platform architecture.md, Section 3 (SEK-01).
 *   "VS Code-style editor running code via the Code Execution Service; supports
 *    C, C++, Python, Java, .NET (C#), HTML, CSS, JavaScript/TypeScript, Node.js
 *    and its major runtime variants, SQL, JSON, and YAML at launch."
 *
 * Post-launch expansion: Go, Rust, Ruby, PHP, Kotlin, and Shell/Bash were added on top
 * of the original launch list (a contract change per this file's own convention, not a
 * silent addition) to cover the languages a general software-engineering curriculum
 * needs beyond the original list.
 *
 * Acceptance criteria this interface MUST enforce:
 *   - "Output/error appears in the editor pane" — CodeEditorProps.onRun returns a
 *     CodeRunResult that the host pane renders.
 *   - "A language outside the launch list shows a clear 'unsupported language'
 *      error, not a silent failure" — Language is a closed string-literal union
 *      so the type system catches unsupported languages at the call site, and
 *      the runtime surface returns Result<CodeRunResult, SekError> with
 *      'unsupported_language' for any unrecognised value (e.g. from stale
 *      persisted content).
 *
 * v0.2.0 contract change: CodeSource (single buffer) -> CodeProject (a named
 * collection of CodeFiles with an entry point). This is a deliberate breaking
 * change, not an additive one — there is no consumer of the old shape to keep
 * compatible (TWA never integrated CodeEditor; SDA's Coding tab is the only
 * real embedder and is updated in lockstep). Posted per SEK's contract-change
 * convention (README.md) before merging.
 */

import type { Result, SekError, UserContext } from '../types/common.js';

/** Closed set of languages supported at launch. Adding one is a contract change. */
export type Language =
  | 'c'
  | 'cpp'
  | 'python'
  | 'java'
  | 'dotnet'        // .NET (C#)
  | 'html'
  | 'css'
  | 'javascript'
  | 'typescript'
  | 'nodejs'        // Node.js and its major runtime variants (per SEK-01 spec)
  | 'sql'
  | 'json'
  | 'yaml'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'kotlin'
  | 'shell';

/** Human-readable label for each language — used in the language picker UI. */
export const LANGUAGE_LABELS: Readonly<Record<Language, string>> = {
  c: 'C',
  cpp: 'C++',
  python: 'Python',
  java: 'Java',
  dotnet: '.NET (C#)',
  html: 'HTML',
  css: 'CSS',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  nodejs: 'Node.js',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  kotlin: 'Kotlin',
  shell: 'Shell',
};

/**
 * Per-language glyph shown next to each file in the explorer tree and tab strip — a
 * plain Unicode/emoji set (no image assets to bundle/ship in the WebView host) matching
 * the same visual convention the embedder's own nav already uses (SDA's shell rail is
 * emoji-icon-per-item too).
 */
export const LANGUAGE_ICONS: Readonly<Record<Language, string>> = {
  c: '🔵',
  cpp: '🔷',
  python: '🐍',
  java: '☕',
  dotnet: '🟣',
  html: '🌐',
  css: '🎨',
  javascript: '🟨',
  typescript: '🔹',
  nodejs: '🟩',
  sql: '🗃️',
  json: '📋',
  yaml: '⚙️',
  go: '🐹',
  rust: '🦀',
  ruby: '💎',
  php: '🐘',
  kotlin: '🎯',
  shell: '💲',
};

/**
 * A single file inside a CodeProject. `path` is also the file-tree/tab key —
 * it may contain `/` to express folders in the editor's tree UI, and the
 * Code Execution Service preserves that real relative path (subdirectories
 * included) when it materializes the project on disk before running it (see
 * campus-backend's DockerCodeRunner.WriteFiles), so a toolchain that resolves
 * paths itself (e.g. package-relative imports) works the same way it would
 * on a student's own machine — not just same-directory auto-discovery.
 */
export interface CodeFile {
  readonly path: string;
  readonly language: Language;
  readonly content: string;
}

/**
 * Source the host pane hands to SEK. Replaces the single-buffer `CodeSource`
 * (pre-0.2.0). One file = one language — a project has no single project-wide
 * language, since a natural student project (e.g. HTML+CSS+JS) mixes them.
 * `entryFilePath` is the file whose language selects the Code Execution
 * Service's runner; it must name a file present in `files`.
 */
export interface CodeProject {
  /** Absent for a new, unsaved project. */
  readonly id?: string;
  readonly name: string;
  /** Non-empty. */
  readonly files: readonly CodeFile[];
  readonly entryFilePath: string;
  /** Which file's tab/editor has focus. Must name a file present in `files`. */
  readonly activeFilePath: string;
  /** Optional stdin the Code Execution Service should feed to the program. */
  readonly stdin?: string;
}

/** Output of a single code run. Mirrors the Code Execution Service response. */
export interface CodeRunResult {
  /** Standard output captured by the runner. */
  readonly stdout: string;
  /** Standard error captured by the runner. */
  readonly stderr: string;
  /** Process exit code; non-zero is a runtime error, not a SEK error. */
  readonly exitCode: number;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the runner applied a timeout — surfaced so the UI can explain. */
  readonly timedOut: boolean;
  /**
   * Coarse outcome classification, sourced from the Code Execution Service's
   * own classification (see campus-backend's DockerCodeRunner.ClassifyRunResult)
   * — lets the Problems panel show a compile error distinctly from a runtime
   * error or a timeout, rather than inferring it from exitCode/timedOut alone.
   * Optional: absent means the embedder's runner doesn't distinguish (treat as
   * unknown/'runtime_error' when exitCode !== 0).
   */
  readonly status?: 'accepted' | 'compilation_error' | 'runtime_error' | 'time_limit_exceeded' | 'internal_error';
}

/**
 * Result of one command in the integrated terminal (SEK-01 follow-up). Deliberately
 * request/response, matching CodeRunResult's own batch shape — see TerminalPanel.tsx's
 * doc comment for why this is not a live pty-backed shell.
 */
export interface TerminalExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Props the embedder (TWA, SDA) passes to the SEK code-editor component.
 *
 * Callbacks are supplied by the embedder — SEK is purely presentational +
 * routing. It does not own persistence or auth; the embedder does.
 */
export interface CodeEditorProps {
  readonly user: UserContext;
  /** The project currently open. Null/absent when the embedder wants a fresh, unsaved project. */
  readonly initialProject?: CodeProject;
  /** Language of a new blank project's single starter file. Defaults to 'python'. */
  readonly defaultLanguage?: Language;
  /** Whether the user is allowed to click "Run". Disable for read-only review. */
  readonly canRun: boolean;
  /** Whether the user is allowed to edit source. Disable for read-only review. */
  readonly canEdit: boolean;
  /**
   * Called when the user clicks Run/presses F5. The embedder is responsible
   * for forwarding the request to the Backend API, which runs it via
   * DockerCodeRunner (a per-submission `docker run` — see architecture doc
   * Section 7). SEK does NOT call the runner directly.
   */
  readonly onRun: (project: CodeProject) => Promise<Result<CodeRunResult, SekError>>;
  /**
   * Persist the project (Ctrl+S / an explicit Save action). Optional: when
   * absent, Save is a no-op and the editor behaves as a scratch surface
   * (matches pre-0.2.0 behavior). The embedder returns the server-canonical
   * value (e.g. an assigned `id` for a first save).
   */
  readonly onSave?: (project: CodeProject) => Promise<Result<CodeProject, SekError>>;
  /** Called whenever the user edits source, switches tabs, or adds/removes a file. Used for autosave hooks. */
  readonly onProjectChange?: (project: CodeProject) => void;
  /** Optional theme override. Defaults to the embedder's design system. */
  readonly theme?: 'light' | 'dark' | 'system';
  /**
   * Integrated terminal (SEK-01 follow-up) — all three optional and only meaningful
   * together; the Terminal tab is hidden entirely unless all three are supplied (mirrors
   * onSave's optional-hides-the-button convention). Materializes the project's files
   * (as of session start — not live-synced from Monaco edits) into a workspace-mounted
   * sandbox container and runs one command at a time against it. See
   * TerminalPanel.tsx's doc comment for the full request/response-not-a-live-shell
   * rationale.
   */
  readonly onTerminalStart?: (files: readonly CodeFile[]) => Promise<Result<{ sessionId: string }, SekError>>;
  readonly onTerminalExec?: (sessionId: string, command: string) => Promise<Result<TerminalExecResult, SekError>>;
  readonly onTerminalClose?: (sessionId: string) => Promise<Result<void, SekError>>;
  /**
   * B2 live preview (SDA/SEK plan) — optional, hides the Preview action when absent (same
   * convention as onSave/onTerminalStart). Only offered for languages whose "run" is
   * really "start a server" or "render a page" (html/css/javascript/nodejs/python — see
   * isPreviewableLanguage in logic.ts), distinct from onRun's batch stdout/stderr model.
   * The embedder is responsible for actually rendering previewUrl (e.g. opening it as a
   * tab in its own built-in browser) — SEK does not render an iframe itself; see
   * OutputPanel.tsx's Preview button for why (multi-file relative-path projects need a
   * real file server, not a `srcdoc` sandbox).
   */
  readonly onRunPreview?: (project: CodeProject) => Promise<Result<{ previewUrl: string }, SekError>>;
}

/**
 * Runtime surface the embedder can call imperatively (e.g. from a toolbar
 * button or a native sidebar outside the editor pane). Component-level
 * concerns stay in the React/Avalonia component; this is the public,
 * framework-agnostic API.
 */
export interface CodeEditorApi {
  /** Re-render the editor with a new project (e.g. when the sidebar opens a different one). */
  loadProject(project: CodeProject): void;
  /** Read the current project out of the editor. */
  getProject(): CodeProject;
  /** Programmatically trigger a run. Returns the same shape as onRun. */
  run(): Promise<Result<CodeRunResult, SekError>>;
}
