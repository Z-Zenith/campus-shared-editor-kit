/**
 * SEK-03 — verifies the Tiptap rich-text editor's Markdown round-trip stays compatible
 * with linkExtraction.ts's raw-text regex (see src/notes/tiptapNoteLink.ts's doc
 * comment). Runs a real headless Tiptap `Editor` instance (no DOM — `element: undefined`
 * works for content get/set, just not for interactive typing simulation), same runtime
 * approach as this repo's other logic tests (Node's built-in type-stripping, no bundler).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TextStyle, Color } from '@tiptap/extension-text-style';

import { NoteLink, unescapeNoteLinkBrackets } from '../src/notes/tiptapNoteLink.ts';

const EXTENSIONS = [
  StarterKit.configure({ link: false }),
  Markdown,
  TaskList,
  TaskItem.configure({ nested: false }),
  TextStyle,
  Color,
  NoteLink,
];

function roundTrip(markdown: string): string {
  const editor = new Editor({ element: null, extensions: EXTENSIONS, content: markdown, contentType: 'markdown' });
  const out = unescapeNoteLinkBrackets(editor.getMarkdown()).trim();
  editor.destroy();
  return out;
}

test('a bare wikilink round-trips through the rich editor unchanged', () => {
  const md = 'Plain paragraph with a [[bare-wikilink]] inside it.';
  assert.equal(roundTrip(md), md);
});

test('an aliased wikilink round-trips through the rich editor unchanged', () => {
  const md = 'Aliased [[some-note-id|Custom anchor text]] link.';
  assert.equal(roundTrip(md), md);
});

test('a markdown id-link round-trips through the rich editor unchanged (not swallowed as a real link)', () => {
  const md = 'An id-link: [Anchor text](id:toNoteId) here.';
  assert.equal(roundTrip(md), md);
});

test('mixed wikilinks and id-links on one line all round-trip unchanged', () => {
  const md = 'Mixed line: [[a]] and [b](id:c) and [[d|e]] together.';
  assert.equal(roundTrip(md), md);
});

test('checklist syntax round-trips without needing an explicit gfm config', () => {
  const md = '- [ ] Task one\n- [x] Task two done';
  assert.equal(roundTrip(md), md);
});

test('headings, bold, italic, and both list types round-trip unchanged', () => {
  for (const md of [
    '# Heading One',
    '## Heading Two',
    '**bold text**',
    '*italic text*',
    '- bullet one\n- bullet two',
    '1. numbered one\n2. numbered two',
  ]) {
    assert.equal(roundTrip(md), md, md);
  }
});
