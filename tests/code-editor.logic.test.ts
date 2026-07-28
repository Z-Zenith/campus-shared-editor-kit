/**
 * SEK-01 — runtime tests for the code-editor's pure logic helpers.
 *
 * Uses Node's built-in test runner directly against TypeScript sources
 * (Node 22+ type stripping) rather than adding a new test-framework
 * dependency — same rationale as tests/notes.linkExtraction.test.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStarterProject,
  defaultFilenameForLanguage,
  inferLanguageFromExtension,
  isSupportedLanguage,
  resizedSize,
  starterSnippetForLanguage,
  unsupportedLanguageError,
  validateProject,
} from '../src/code-editor/logic.ts';
import type { CodeProject, Language } from '../src/code-editor/types.ts';

const LAUNCH_LIST: readonly Language[] = [
  'c',
  'cpp',
  'python',
  'java',
  'dotnet',
  'html',
  'css',
  'javascript',
  'typescript',
  'nodejs',
  'sql',
  'json',
  'yaml',
  'go',
  'rust',
  'ruby',
  'php',
  'kotlin',
  'shell',
];

test('isSupportedLanguage accepts every launch-list language', () => {
  for (const language of LAUNCH_LIST) {
    assert.equal(isSupportedLanguage(language), true, language);
  }
});

test('isSupportedLanguage rejects a foreign or stale language value', () => {
  assert.equal(isSupportedLanguage('perl'), false);
  assert.equal(isSupportedLanguage(''), false);
  assert.equal(isSupportedLanguage('PYTHON'), false); // case-sensitive
});

test('unsupportedLanguageError returns the canonical code and names the rejected value', () => {
  const err = unsupportedLanguageError('perl');
  assert.equal(err.code, 'unsupported_language');
  assert.match(err.message, /perl/);
});

test('inferLanguageFromExtension maps known extensions', () => {
  assert.equal(inferLanguageFromExtension('main.py'), 'python');
  assert.equal(inferLanguageFromExtension('Main.java'), 'java');
  assert.equal(inferLanguageFromExtension('Program.cs'), 'dotnet');
  assert.equal(inferLanguageFromExtension('index.html'), 'html');
  assert.equal(inferLanguageFromExtension('style.css'), 'css');
  assert.equal(inferLanguageFromExtension('app.js'), 'javascript');
  assert.equal(inferLanguageFromExtension('types.ts'), 'typescript');
  assert.equal(inferLanguageFromExtension('config.yml'), 'yaml');
  assert.equal(inferLanguageFromExtension('main.go'), 'go');
  assert.equal(inferLanguageFromExtension('main.rs'), 'rust');
  assert.equal(inferLanguageFromExtension('main.rb'), 'ruby');
  assert.equal(inferLanguageFromExtension('main.php'), 'php');
  assert.equal(inferLanguageFromExtension('main.kt'), 'kotlin');
  assert.equal(inferLanguageFromExtension('main.sh'), 'shell');
});

test('inferLanguageFromExtension returns null for unknown or missing extensions', () => {
  assert.equal(inferLanguageFromExtension('README'), null);
  assert.equal(inferLanguageFromExtension('data.pl'), null);
  assert.equal(inferLanguageFromExtension(''), null);
});

test('buildStarterProject creates a single-file project with matching entry/active paths', () => {
  const project = buildStarterProject('python', 'main.py', 'print(1)');
  assert.deepEqual(project, {
    name: 'Untitled project',
    files: [{ path: 'main.py', language: 'python', content: 'print(1)' }],
    entryFilePath: 'main.py',
    activeFilePath: 'main.py',
  });
});

test('validateProject accepts a well-formed multi-file, mixed-language project', () => {
  const project: CodeProject = {
    name: 'web thing',
    files: [
      { path: 'index.html', language: 'html', content: '<html></html>' },
      { path: 'style.css', language: 'css', content: 'body {}' },
      { path: 'app.js', language: 'javascript', content: 'console.log(1)' },
    ],
    entryFilePath: 'index.html',
    activeFilePath: 'app.js',
  };
  assert.equal(validateProject(project), null);
});

test('validateProject rejects an empty project', () => {
  const project: CodeProject = {
    name: 'empty',
    files: [],
    entryFilePath: 'main.py',
    activeFilePath: 'main.py',
  };
  const err = validateProject(project);
  assert.equal(err?.code, 'validation_error');
});

test('validateProject rejects duplicate file paths', () => {
  const project: CodeProject = {
    name: 'dup',
    files: [
      { path: 'main.py', language: 'python', content: 'a' },
      { path: 'main.py', language: 'python', content: 'b' },
    ],
    entryFilePath: 'main.py',
    activeFilePath: 'main.py',
  };
  const err = validateProject(project);
  assert.equal(err?.code, 'validation_error');
  assert.match(err?.message ?? '', /Duplicate/);
});

test('validateProject rejects a file with an unsupported language', () => {
  const project = {
    name: 'bad lang',
    files: [{ path: 'main.pl', language: 'perl', content: '' }],
    entryFilePath: 'main.pl',
    activeFilePath: 'main.pl',
  } as unknown as CodeProject;
  const err = validateProject(project);
  assert.equal(err?.code, 'unsupported_language');
});

test('validateProject rejects an entryFilePath not present in files', () => {
  const project: CodeProject = {
    name: 'bad entry',
    files: [{ path: 'main.py', language: 'python', content: '' }],
    entryFilePath: 'missing.py',
    activeFilePath: 'main.py',
  };
  const err = validateProject(project);
  assert.equal(err?.code, 'validation_error');
  assert.match(err?.message ?? '', /Entry file/);
});

test('validateProject rejects an activeFilePath not present in files', () => {
  const project: CodeProject = {
    name: 'bad active',
    files: [{ path: 'main.py', language: 'python', content: '' }],
    entryFilePath: 'main.py',
    activeFilePath: 'missing.py',
  };
  const err = validateProject(project);
  assert.equal(err?.code, 'validation_error');
  assert.match(err?.message ?? '', /Active file/);
});

test('defaultFilenameForLanguage covers every launch-list language with a non-empty filename', () => {
  for (const language of LAUNCH_LIST) {
    const filename = defaultFilenameForLanguage(language);
    assert.ok(filename.length > 0, language);
    // Every default filename must itself round-trip back to the same language
    // via extension inference — otherwise picking a language and accepting the
    // picker's own suggested filename would silently mislabel the file the
    // moment it's reloaded from persisted content. Except 'nodejs': its default
    // filename uses .js like 'javascript' by necessity (there's no separate
    // Node-specific extension) — inferLanguageFromExtension deliberately maps
    // .js to 'javascript' only, per that function's own doc comment, since the
    // distinction is about the runner, not inferable from a filename.
    if (language === 'nodejs') continue;
    assert.equal(inferLanguageFromExtension(filename), language, filename);
  }
});

test('defaultFilenameForLanguage capitalizes Java to match its public class name', () => {
  assert.equal(defaultFilenameForLanguage('java'), 'Main.java');
});

test('starterSnippetForLanguage covers every launch-list language', () => {
  for (const language of LAUNCH_LIST) {
    // Snippet is allowed to be empty (e.g. python/css/yaml keep the pre-existing
    // blank-file behavior) — this just asserts the map itself is exhaustive and
    // returns a string, not that every language has non-empty boilerplate.
    assert.equal(typeof starterSnippetForLanguage(language), 'string', language);
  }
});

test('starterSnippetForLanguage seeds language-appropriate boilerplate', () => {
  assert.match(starterSnippetForLanguage('c'), /#include\s*<stdio\.h>/);
  assert.match(starterSnippetForLanguage('java'), /public class Main/);
  assert.equal(starterSnippetForLanguage('python'), '');
});

test('resizedSize adds the delta to the starting size, within bounds', () => {
  assert.equal(resizedSize(240, 40, 160, 480), 280);
  assert.equal(resizedSize(240, -40, 160, 480), 200);
});

test('resizedSize clamps to min when the delta would go below it', () => {
  assert.equal(resizedSize(240, -1000, 160, 480), 160);
});

test('resizedSize clamps to max when the delta would go above it', () => {
  assert.equal(resizedSize(240, 1000, 160, 480), 480);
});

test('resizedSize leaves size unchanged for a zero delta', () => {
  assert.equal(resizedSize(240, 0, 160, 480), 240);
});
