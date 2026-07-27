/**
 * SEK-01 — pure code-editor logic.
 *
 * Framework-agnostic on purpose (no React) so it can be unit-tested directly,
 * mirroring notes/linkExtraction.ts.
 */

import type { CodeFile, CodeProject, Language } from './types.js';
import type { SekError } from '../types/common.js';

// Deliberately not imported from types.ts's LANGUAGE_LABELS: this module is
// loaded directly by `node --test` against raw .ts sources (no bundler), and
// Node's native type-stripping only erases `import type` — a runtime value
// import across sibling .ts files fails to resolve outside a bundler. Kept
// in sync with `Language` (not just LANGUAGE_LABELS) via the exhaustive
// Record below, so an added/removed language literal fails to compile here
// too, not just in the label map.
const LANGUAGE_MEMBERS: Readonly<Record<Language, true>> = {
  c: true,
  cpp: true,
  python: true,
  java: true,
  dotnet: true,
  html: true,
  css: true,
  javascript: true,
  typescript: true,
  nodejs: true,
  sql: true,
  json: true,
  yaml: true,
};

const SUPPORTED_LANGUAGES = new Set<string>(Object.keys(LANGUAGE_MEMBERS));

/**
 * Runtime guard for the closed `Language` union. `Language` is a compile-time
 * string-literal union, but data can still arrive at runtime with a stale or
 * foreign value (e.g. content persisted before a language was retired). This
 * is the runtime half of the "a language outside the launch list shows a
 * clear 'unsupported language' error, not a silent failure" acceptance
 * criterion — the compile-time half is the closed union itself.
 */
export function isSupportedLanguage(language: string): language is Language {
  return SUPPORTED_LANGUAGES.has(language);
}

/**
 * Canonical error for a language outside the launch list. Centralized here
 * (rather than built ad hoc at each call site) so the message/code pairing
 * can't drift between the component's Run path and its loadProject path.
 */
export function unsupportedLanguageError(language: string): SekError {
  return {
    code: 'unsupported_language',
    message: `"${language}" is not a supported language.`,
  };
}

/** Extension (including the dot, case-insensitive) -> Language, for the "new file" flow. */
const EXTENSION_LANGUAGE_MAP: Readonly<Record<string, Language>> = {
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.py': 'python',
  '.java': 'java',
  '.cs': 'dotnet',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

/**
 * Infers a Language from a filename's extension, for pre-selecting the "new
 * file" language picker from what the student typed (e.g. "helper.py" ->
 * python). Returns null for an unrecognised/missing extension — callers
 * should fall back to the project's current default rather than guessing.
 * `.js`/`.mjs`/`.cjs` all map to 'javascript' rather than 'nodejs': the
 * distinction between those two Language values is about the *runner*
 * (browser-ish JS vs. Node.js), not something inferable from a filename.
 */
export function inferLanguageFromExtension(filename: string): Language | null {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex < 0) return null;
  const ext = filename.slice(dotIndex).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

/**
 * Validates a CodeProject's internal consistency: every file's language must
 * be supported, entryFilePath/activeFilePath must each name a file actually
 * present in `files`, and no two files may share a path. Returns the first
 * violation found (as a SekError), or null when the project is valid. This is
 * the multi-file equivalent of the old single-language guard — called once
 * per project (at load and at run/save time) rather than once per file, so
 * the "clear error, not a silent failure" acceptance criterion holds for the
 * whole project, not just one buffer.
 */
export function validateProject(project: CodeProject): SekError | null {
  if (project.files.length === 0) {
    return { code: 'validation_error', message: 'A project must have at least one file.' };
  }

  const seenPaths = new Set<string>();
  for (const file of project.files) {
    if (seenPaths.has(file.path)) {
      return { code: 'validation_error', message: `Duplicate file path "${file.path}".` };
    }
    seenPaths.add(file.path);

    if (!isSupportedLanguage(file.language)) {
      return unsupportedLanguageError(file.language);
    }
  }

  if (!seenPaths.has(project.entryFilePath)) {
    return {
      code: 'validation_error',
      message: `Entry file "${project.entryFilePath}" is not one of the project's files.`,
    };
  }
  if (!seenPaths.has(project.activeFilePath)) {
    return {
      code: 'validation_error',
      message: `Active file "${project.activeFilePath}" is not one of the project's files.`,
    };
  }

  return null;
}

/**
 * Builds a single-file starter CodeProject, e.g. for a brand-new blank
 * project or the "unsupported language" fallback in CodeEditor.tsx.
 */
export function buildStarterProject(language: Language, filename: string, content = ''): CodeProject {
  const file: CodeFile = { path: filename, language, content };
  return {
    name: 'Untitled project',
    files: [file],
    entryFilePath: filename,
    activeFilePath: filename,
  };
}
