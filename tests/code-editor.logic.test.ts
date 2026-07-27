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
  inferLanguageFromExtension,
  isSupportedLanguage,
  unsupportedLanguageError,
  validateProject,
} from '../src/code-editor/logic.ts';
import type { CodeProject } from '../src/code-editor/types.ts';

test('isSupportedLanguage accepts every launch-list language', () => {
  const launchList = [
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
  ];
  for (const language of launchList) {
    assert.equal(isSupportedLanguage(language), true, language);
  }
});

test('isSupportedLanguage rejects a foreign or stale language value', () => {
  assert.equal(isSupportedLanguage('ruby'), false);
  assert.equal(isSupportedLanguage(''), false);
  assert.equal(isSupportedLanguage('PYTHON'), false); // case-sensitive
});

test('unsupportedLanguageError returns the canonical code and names the rejected value', () => {
  const err = unsupportedLanguageError('ruby');
  assert.equal(err.code, 'unsupported_language');
  assert.match(err.message, /ruby/);
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
});

test('inferLanguageFromExtension returns null for unknown or missing extensions', () => {
  assert.equal(inferLanguageFromExtension('README'), null);
  assert.equal(inferLanguageFromExtension('data.rb'), null);
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
    files: [{ path: 'main.rb', language: 'ruby', content: '' }],
    entryFilePath: 'main.rb',
    activeFilePath: 'main.rb',
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
