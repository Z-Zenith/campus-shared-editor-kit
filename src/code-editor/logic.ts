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
  go: true,
  rust: true,
  ruby: true,
  php: true,
  kotlin: true,
  shell: true,
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
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.sh': 'shell',
  '.bash': 'shell',
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
 * Minimal boilerplate seeded into a brand-new file created via the "New file"
 * picker, so a student picking e.g. Java doesn't face a totally blank buffer
 * with no idea how to start. Deliberately not used for buildStarterProject's
 * own default (kept at content='' below) — that path is the very first file
 * in a new blank project, which stays as it was before this map existed.
 */
const STARTER_SNIPPETS: Readonly<Record<Language, string>> = {
  c: '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    return 0;\n}\n',
  python: '',
  java: 'public class Main {\n    public static void main(String[] args) {\n    }\n}\n',
  dotnet: 'using System;\n\nclass Program\n{\n    static void Main(string[] args)\n    {\n    }\n}\n',
  html: '<!doctype html>\n<html>\n<head>\n    <title>Document</title>\n</head>\n<body>\n\n</body>\n</html>\n',
  css: '',
  javascript: "console.log('Hello, world!');\n",
  typescript: "console.log('Hello, world!');\n",
  nodejs: "console.log('Hello, world!');\n",
  sql: '-- SQL query\nSELECT 1;\n',
  json: '{}\n',
  yaml: '',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n',
  rust: 'fn main() {\n    println!("Hello, world!");\n}\n',
  ruby: '',
  // Unlike ruby/shell, PHP source outside <?php ?> tags is emitted literally rather
  // than executed — an empty starter file would just run as a no-op that prints
  // nothing, not "no boilerplate needed" the way the scripting languages above are.
  php: '<?php\n\necho "Hello, world!\\n";\n',
  kotlin: 'fun main() {\n    println("Hello, world!")\n}\n',
  shell: '',
};

/** Starter boilerplate for a new file of the given language — see STARTER_SNIPPETS. */
export function starterSnippetForLanguage(language: Language): string {
  return STARTER_SNIPPETS[language];
}

/**
 * Filename the "New file" picker pre-fills when a language is selected —
 * still editable by the student afterward. Java capitalizes to `Main.java`
 * since the JVM requires the public class name (Main, per STARTER_SNIPPETS)
 * to match the filename; every other language just follows its most common
 * entry-point convention.
 */
const DEFAULT_FILENAME_BY_LANGUAGE: Readonly<Record<Language, string>> = {
  c: 'main.c',
  cpp: 'main.cpp',
  python: 'main.py',
  java: 'Main.java',
  dotnet: 'Program.cs',
  html: 'index.html',
  css: 'styles.css',
  javascript: 'main.js',
  typescript: 'main.ts',
  nodejs: 'main.js',
  sql: 'query.sql',
  json: 'data.json',
  yaml: 'config.yaml',
  go: 'main.go',
  rust: 'main.rs',
  ruby: 'main.rb',
  php: 'main.php',
  kotlin: 'main.kt',
  shell: 'main.sh',
};

/** Default filename the "New file" picker pre-fills for the given language. */
export function defaultFilenameForLanguage(language: Language): string {
  return DEFAULT_FILENAME_BY_LANGUAGE[language];
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

/**
 * Pure drag math for the sidebar/output resize handles (see ResizeHandle.tsx): given the
 * pointer's total movement since the drag started and the size the pane started at, returns
 * the new size clamped to [min, max]. Kept separate from the pointer-event wiring itself (DOM-
 * only, lives in ResizeHandle.tsx) so the actual arithmetic is unit-testable the same way as
 * every other piece of editor logic in this module.
 */
export function resizedSize(startSize: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, startSize + delta));
}

/**
 * Command-palette file switcher (SEK-01 shell-fidelity pass): subsequence fuzzy match,
 * VS Code's own "Go to File" style — every character of `query` must appear in the
 * candidate path in order, not necessarily contiguously, case-insensitive. An empty
 * query matches everything (so the palette shows the full file list before typing).
 * Results are ordered by match quality (earlier/tighter matches first), then
 * alphabetically as a stable tiebreaker — pure and independent of React/Monaco so it's
 * unit-testable the same way as every other helper in this module.
 */
export function fuzzyMatchFiles(paths: readonly string[], query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...paths].sort((a, b) => a.localeCompare(b));
  }

  const scored: Array<{ path: string; score: number }> = [];
  for (const path of paths) {
    const score = subsequenceScore(path.toLowerCase(), trimmed);
    if (score !== null) {
      scored.push({ path, score });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));
  return scored.map((s) => s.path);
}

/**
 * Returns null if `query`'s characters don't all appear in `text` in order. Otherwise
 * returns a score where lower is a better match — the index of the first match plus the
 * total span consumed, so "main.py" scores better for query "main" than
 * "src/domain/main.py" does (earlier, tighter match wins).
 */
function subsequenceScore(text: string, query: string): number | null {
  let textIndex = 0;
  let firstMatchIndex = -1;
  for (const ch of query) {
    const found = text.indexOf(ch, textIndex);
    if (found === -1) return null;
    if (firstMatchIndex === -1) firstMatchIndex = found;
    textIndex = found + 1;
  }
  const span = textIndex - firstMatchIndex;
  return firstMatchIndex + span;
}
