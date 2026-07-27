/**
 * SEK-01 — Code editor component.
 *
 * Implements the CodeEditorProps/CodeEditorApi contract from ./types.ts.
 * Unstyled on purpose (semantic HTML + stable class hooks only) — SEK owns
 * no styling opinions, the embedder (TWA, SDA) skins it. SEK does not call
 * the Code Execution Service itself; every run goes through the embedder's
 * `onRun` callback (see CodeEditorProps.onRun doc comment).
 *
 * Powered by Monaco (the same editor engine VS Code itself uses) via
 * @monaco-editor/react, which keys its internal model cache by the `path`
 * prop — switching the active file tab reuses (rather than recreates) that
 * file's model, preserving undo history/scroll/cursor per open file for
 * free. The embedder is responsible for pointing @monaco-editor/react's
 * loader at a locally-bundled Monaco instance instead of its default CDN
 * loader (see src/host/monaco-setup.ts) — this component itself doesn't care
 * where Monaco's assets come from.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { Result, SekError } from '../types/common.js';
import type { CodeEditorApi, CodeEditorProps, CodeFile, CodeProject, CodeRunResult, Language } from './types.js';
import { LANGUAGE_ICONS, LANGUAGE_LABELS } from './types.js';
import {
  buildStarterProject,
  defaultFilenameForLanguage,
  isSupportedLanguage,
  starterSnippetForLanguage,
  validateProject,
} from './logic.js';
import { FileExplorer } from './FileExplorer.js';
import { FileTabs } from './FileTabs.js';
import { OutputPanel } from './OutputPanel.js';

/** Our closed Language union -> Monaco's built-in language id (Monarch tokenizer). */
const MONACO_LANGUAGE_IDS: Readonly<Record<Language, string>> = {
  c: 'c',
  cpp: 'cpp',
  python: 'python',
  java: 'java',
  dotnet: 'csharp',
  html: 'html',
  css: 'css',
  javascript: 'javascript',
  typescript: 'typescript',
  nodejs: 'javascript',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  kotlin: 'kotlin',
  shell: 'shell',
};

function newProjectDraftId(): string {
  // crypto.randomUUID is available in every embedder runtime we target
  // (browsers, Node 19+, and Avalonia's WebView2/CEF host) — mirrors
  // NotesEditor's newNoteId helper.
  return globalThis.crypto.randomUUID();
}

export const CodeEditor = forwardRef<CodeEditorApi, CodeEditorProps>(
  function CodeEditor(
    { initialProject, defaultLanguage, canRun, canEdit, onRun, onSave, onProjectChange, theme },
    ref
  ) {
    const fallbackLanguage: Language =
      defaultLanguage && isSupportedLanguage(defaultLanguage) ? defaultLanguage : 'python';

    // Same "don't silently mislabel content under a fallback language"
    // reasoning as the pre-0.2.0 single-file editor, applied per-file: a
    // project persisted with a since-retired language is rejected wholesale
    // (not partially loaded) so entry/active-path invariants can't desync
    // from a half-applied project.
    const initialValidationError = initialProject ? validateProject(initialProject) : null;
    const startingProject: CodeProject =
      initialProject && !initialValidationError
        ? initialProject
        : buildStarterProject(fallbackLanguage, `main.${fallbackLanguage === 'python' ? 'py' : 'txt'}`);

    const [projectId, setProjectId] = useState(startingProject.id);
    const [projectName, setProjectName] = useState(startingProject.name);
    const [files, setFiles] = useState<readonly CodeFile[]>(startingProject.files);
    const [entryFilePath, setEntryFilePath] = useState(startingProject.entryFilePath);
    const [activeFilePath, setActiveFilePath] = useState(startingProject.activeFilePath);
    const [stdin, setStdin] = useState(startingProject.stdin ?? '');
    const [result, setResult] = useState<CodeRunResult | null>(null);
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<SekError | null>(initialValidationError);
    const [newFileDraft, setNewFileDraft] = useState<string | null>(null);
    const [newFileLanguage, setNewFileLanguage] = useState<Language>(fallbackLanguage);

    const activeFile = files.find((f) => f.path === activeFilePath) ?? files[0];

    const currentProject = useMemo<CodeProject>(
      () => ({
        ...(projectId ? { id: projectId } : {}),
        name: projectName,
        files,
        entryFilePath,
        activeFilePath,
        ...(stdin ? { stdin } : {}),
      }),
      [projectId, projectName, files, entryFilePath, activeFilePath, stdin]
    );

    // Imperative-handle methods (and the keybinding handlers registered in
    // handleEditorMount) close over stale state without this — same "ref
    // mirrors latest draft" pattern as the pre-0.2.0 editor's sourceRef and
    // NotesEditor's contentRef.
    const projectRef = useRef(currentProject);
    projectRef.current = currentProject;
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun;
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;
    const canRunRef = useRef(canRun);
    canRunRef.current = canRun;

    const notifyProjectChange = (project: CodeProject) => onProjectChange?.(project);

    const runProject = useCallback(async (project: CodeProject): Promise<Result<CodeRunResult, SekError>> => {
      const validationErr = validateProject(project);
      if (validationErr) {
        setError(validationErr);
        return { ok: false, error: validationErr };
      }

      if (!canRunRef.current) {
        const err: SekError = { code: 'unauthorized', message: 'You are not allowed to run code.' };
        setError(err);
        return { ok: false, error: err };
      }

      setRunning(true);
      setError(null);
      const outcome = await onRunRef.current(project);
      setRunning(false);

      if (outcome.ok) {
        setResult(outcome.value);
      } else {
        setResult(null);
        setError(outcome.error);
      }
      return outcome;
    }, []);

    const saveProject = useCallback(async () => {
      if (!canEdit || !onSaveRef.current) return;
      // Assign a draft id up front (mirrors NotesEditor's handleSave) so CodeBridge-style
      // embedders can attempt an update-by-id first and fall back to create-on-404,
      // rather than needing a separate "is this the first save" branch of their own.
      const draftId = projectRef.current.id ?? newProjectDraftId();
      if (!projectRef.current.id) setProjectId(draftId);
      const project: CodeProject = { ...projectRef.current, id: draftId };

      const validationErr = validateProject(project);
      if (validationErr) {
        setError(validationErr);
        return;
      }
      setSaving(true);
      setError(null);
      const outcome = await onSaveRef.current(project);
      setSaving(false);
      if (outcome.ok) {
        setProjectId(outcome.value.id);
        notifyProjectChange(outcome.value);
      } else {
        setError(outcome.error);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canEdit]);

    useImperativeHandle(
      ref,
      (): CodeEditorApi => ({
        loadProject: (project) => {
          const validationErr = validateProject(project);
          if (validationErr) {
            setError(validationErr);
            return;
          }
          setError(null);
          setResult(null);
          setProjectId(project.id);
          setProjectName(project.name);
          setFiles(project.files);
          setEntryFilePath(project.entryFilePath);
          setActiveFilePath(project.activeFilePath);
          setStdin(project.stdin ?? '');
        },
        getProject: () => projectRef.current,
        run: () => runProject(projectRef.current),
      }),
      [runProject]
    );

    const handleContentChange = (path: string, value: string | undefined) => {
      const nextContent = value ?? '';
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: nextContent } : f)));
      setResult(null);
      setError(null);
    };

    // Fire onProjectChange after state settles, using the freshest project
    // snapshot rather than the one captured at the start of the triggering
    // event handler (content edits land in state one tick before this runs).
    useEffect(() => {
      notifyProjectChange(currentProject);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProject]);

    const handleSelectFile = (path: string) => setActiveFilePath(path);

    const handleSetEntry = (path: string) => setEntryFilePath(path);

    const handleDeleteFile = (path: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.path !== path);
        const firstRemaining = next[0];
        if (!firstRemaining) return prev; // never delete the last file
        if (entryFilePath === path) setEntryFilePath(firstRemaining.path);
        if (activeFilePath === path) setActiveFilePath(firstRemaining.path);
        return next;
      });
    };

    const startNewFile = () => {
      setNewFileLanguage(fallbackLanguage);
      setNewFileDraft(defaultFilenameForLanguage(fallbackLanguage));
    };

    // Switching the picker re-seeds the filename to that language's default —
    // the input stays freely editable afterward, this is just a starting point.
    const handleNewFileLanguageChange = (language: Language) => {
      setNewFileLanguage(language);
      setNewFileDraft(defaultFilenameForLanguage(language));
    };

    const commitNewFile = () => {
      const name = (newFileDraft ?? '').trim();
      setNewFileDraft(null);
      if (!name) return;
      if (files.some((f) => f.path === name)) {
        setError({ code: 'validation_error', message: `A file named "${name}" already exists.` });
        return;
      }
      // The explicitly-picked language wins over extension inference — a student
      // who picks "Java" but types a plain "foo" (no/wrong extension) still gets
      // a Java file, not a silent fallback to fallbackLanguage.
      const language = newFileLanguage;
      const content = starterSnippetForLanguage(language);

      // A brand-new file becomes the entry point too, but only when the project is
      // still just its single untouched starter file — the overwhelmingly common case
      // is "I opened Coding (which defaults to a blank main.py) and actually want to
      // write in a different language." Run always executes entryFilePath, not
      // whatever's merely active, so leaving entry on the untouched starter after this
      // is exactly the bug where picking Java, writing real code, and hitting Run
      // silently re-ran an empty main.py instead. Once a project has real, edited
      // multi-file content, adding another file must NOT steal entry out from under it
      // — that check happens against the *pre-update* files/entryFilePath here, before
      // the new file is added below.
      const soleFile = files.length === 1 ? files[0] : undefined;
      const isSoleUntouchedStarter =
        soleFile !== undefined &&
        soleFile.path === entryFilePath &&
        soleFile.content === starterSnippetForLanguage(soleFile.language);

      setFiles((prev) => [...prev, { path: name, language, content }]);
      setActiveFilePath(name);
      if (isSoleUntouchedStarter) {
        setEntryFilePath(name);
      }
      setError(null);
    };

    const handleEditorMount: OnMount = (editorInstance, monaco) => {
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void saveProject();
      });
      editorInstance.addCommand(monaco.KeyCode.F5, () => {
        void runProject(projectRef.current);
      });
    };

    // Resolve 'system' against the OS/embedder color scheme, live — WebView2
    // forwards prefers-color-scheme, so this flips without a remount if the
    // OS theme changes mid-session.
    const [systemPrefersDark, setSystemPrefersDark] = useState(
      () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );
    useEffect(() => {
      const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
      if (!mql) return;
      const listener = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    }, []);
    const resolvedTheme = theme === 'system' || !theme ? (systemPrefersDark ? 'dark' : 'light') : theme;
    const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

    return (
      <div className="sek-code-editor" data-theme={resolvedTheme}>
        {error && !running && (
          <div className="sek-code-editor__error" role="alert">
            {error.message}
          </div>
        )}
        <div className="sek-code-editor__body">
          <FileExplorer
            files={files}
            activeFilePath={activeFilePath}
            entryFilePath={entryFilePath}
            canEdit={canEdit}
            onSelect={handleSelectFile}
            onNewFile={startNewFile}
            onDeleteFile={handleDeleteFile}
            onSetEntry={handleSetEntry}
          />
          <div className="sek-code-editor__main">
            <FileTabs
              files={files}
              activeFilePath={activeFilePath}
              entryFilePath={entryFilePath}
              canEdit={canEdit}
              onSelect={handleSelectFile}
              onCloseFile={handleDeleteFile}
            />
            {newFileDraft !== null && (
              // onBlur lives on the whole form (not the bare input, as before adding
              // the language <select>) so picking a language doesn't itself commit —
              // relatedTarget containment is the standard way to detect focus actually
              // leaving a composite widget vs. moving between its own controls.
              <div
                className="sek-code-editor__new-file-form"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    commitNewFile();
                  }
                }}
              >
                <select
                  className="sek-code-editor__new-file-language"
                  aria-label="New file language"
                  value={newFileLanguage}
                  onChange={(e) => handleNewFileLanguageChange(e.target.value as Language)}
                >
                  {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
                    <option key={lang} value={lang}>
                      {LANGUAGE_ICONS[lang]} {LANGUAGE_LABELS[lang]}
                    </option>
                  ))}
                </select>
                <input
                  autoFocus
                  className="sek-code-editor__new-file-input"
                  placeholder="filename.ext"
                  value={newFileDraft}
                  onChange={(e) => setNewFileDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNewFile();
                    if (e.key === 'Escape') setNewFileDraft(null);
                  }}
                />
              </div>
            )}
            <div className="sek-code-editor__editor">
              {activeFile && (
                <Editor
                  path={activeFile.path}
                  language={MONACO_LANGUAGE_IDS[activeFile.language]}
                  value={activeFile.content}
                  theme={monacoTheme}
                  onMount={handleEditorMount}
                  onChange={(value) => handleContentChange(activeFile.path, value)}
                  options={{
                    readOnly: !canEdit,
                    minimap: { enabled: true },
                    bracketPairColorization: { enabled: true },
                    fontFamily: 'Consolas, "Courier New", monospace',
                    fontSize: 14,
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                  }}
                />
              )}
            </div>
            <div className="sek-code-editor__statusbar">
              <span>
                {activeFile && (
                  <span className="sek-code-editor__file-icon" aria-hidden="true">
                    {LANGUAGE_ICONS[activeFile.language]}
                  </span>
                )}
                {activeFile ? LANGUAGE_LABELS[activeFile.language] : ''}
              </span>
              <span>{activeFilePath}</span>
            </div>
            <div className="sek-code-editor__stdin-wrap">
              <label className="sek-code-editor__stdin-label" htmlFor="sek-code-editor-stdin">
                STDIN
              </label>
              <textarea
                id="sek-code-editor-stdin"
                className="sek-code-editor__stdin"
                value={stdin}
                onChange={(e) => {
                  setStdin(e.target.value);
                  setResult(null);
                  setError(null);
                }}
                disabled={!canEdit}
                placeholder="Optional input piped to the program when it runs"
              />
            </div>
            {(canRun || onSave) && (
              <div className="sek-code-editor__actions">
                {canRun && (
                  <button
                    type="button"
                    className="sek-code-editor__run-button"
                    onClick={() => void runProject(currentProject)}
                    disabled={running}
                  >
                    <span className="sek-code-editor__button-icon" aria-hidden="true">{running ? '' : '▶'}</span>
                    {running ? 'Running…' : 'Run'}
                    {!running && <span className="sek-code-editor__button-hint">F5</span>}
                  </button>
                )}
                {canEdit && onSave && (
                  <button
                    type="button"
                    className="sek-code-editor__save-button"
                    onClick={() => void saveProject()}
                    disabled={saving}
                  >
                    <span className="sek-code-editor__button-icon" aria-hidden="true">{saving ? '' : '💾'}</span>
                    {saving ? 'Saving…' : 'Save'}
                    {!saving && <span className="sek-code-editor__button-hint">Ctrl+S</span>}
                  </button>
                )}
              </div>
            )}
            <OutputPanel result={result} error={running ? null : error} running={running} />
          </div>
        </div>
      </div>
    );
  }
);
