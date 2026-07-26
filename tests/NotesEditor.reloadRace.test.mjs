/**
 * SEK-03 — regression coverage for reload()'s stale-write race.
 *
 * Every other test in this repo either type-checks (contract.smoke.ts) or
 * exercises pure logic (notes.linkExtraction.test.ts, etc.) — none of them
 * mount NotesEditor with a real DOM render and re-render it with a changed
 * `currentNote` prop, so none could have caught this: reload() had no guard
 * against the embedder switching `currentNote` while a reload for the
 * *previous* note was still in flight, so its resolution could silently
 * overwrite whatever note the user had since opened and started editing.
 *
 * Requires a real client render (jsdom + react-dom/client + act) rather than
 * this repo's usual node-test-against-.ts-sources style, for the same reason
 * campus-direct-messaging's MessageThreadView.threadSwitch.test.mjs needed
 * one — and imports the built dist/ output rather than the .tsx source
 * directly, since Node's native TypeScript support strips types but doesn't
 * transform JSX.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
// Node 21+ ships its own global `navigator` as a getter-only property, so a plain
// assignment throws — redefine it instead so React/jsdom see the jsdom navigator.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Must be dynamic: react-dom/client resolves against the jsdom globals set up above,
// and static ESM imports are hoisted ahead of any top-level statements in this file.
const React = (await import('react')).default;
const { createRef, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { NotesEditor } = await import('../dist/notes/NotesEditor.js');

const user = { userId: 'teacher-1', sessionToken: 'tok', role: 'teacher', collegeId: 'college-1' };

const noteX = {
  id: 'note-X',
  ownerId: 'teacher-1',
  title: 'Note X title',
  contentMarkdown: 'X body',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const noteY = {
  id: 'note-Y',
  ownerId: 'teacher-1',
  title: 'Note Y title',
  contentMarkdown: 'Y body',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setInputValue(el, tagPrototype, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(tagPrototype, 'value').set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

test("SEK-03: a reload() still in flight for a since-abandoned note must not overwrite the currently-open note", async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  // Note X's reload() is held open under our control so we can switch to
  // note Y (and start editing it) before it resolves.
  let resolveXReload;
  const xReloadGate = new Promise((resolve) => {
    resolveXReload = resolve;
  });

  const onResolveLink = async (noteId) => {
    if (noteId === noteX.id) {
      await xReloadGate;
      return { ok: true, value: noteX };
    }
    if (noteId === noteY.id) return { ok: true, value: noteY };
    return { ok: false, error: { code: 'note_not_found', message: 'not found' } };
  };
  const onListBacklinks = async () => ({ ok: true, value: [] });
  const onSave = async (note) => ({ ok: true, value: note });
  const onDelete = async () => ({ ok: true, value: undefined });

  const ref = createRef();

  // --- Open note X. ---
  await act(async () => {
    root.render(
      React.createElement(NotesEditor, {
        ref,
        user,
        currentNote: noteX,
        canEdit: true,
        onSave,
        onDelete,
        onResolveLink,
        onListBacklinks,
      })
    );
    await flushMicrotasks();
  });

  // --- Call reload() for X — held open by the gate above. ---
  await act(async () => {
    ref.current.reload();
    await flushMicrotasks();
  });

  // --- Switch to note Y before X's reload resolves, and edit Y's draft. ---
  await act(async () => {
    root.render(
      React.createElement(NotesEditor, {
        ref,
        user,
        currentNote: noteY,
        canEdit: true,
        onSave,
        onDelete,
        onResolveLink,
        onListBacklinks,
      })
    );
    await flushMicrotasks();
  });

  const titleInput = container.querySelector('.sek-notes-editor__title');
  const bodyTextarea = container.querySelector('.sek-notes-editor__body');
  await act(async () => {
    setInputValue(titleInput, dom.window.HTMLInputElement.prototype, 'Y title edited by user');
    setInputValue(bodyTextarea, dom.window.HTMLTextAreaElement.prototype, 'Y body edited by user');
  });

  // --- Now let X's reload resolve. ---
  await act(async () => {
    resolveXReload();
    await flushMicrotasks();
  });

  // The regression: X's stale reload resolving must not touch note Y's
  // on-screen draft at all.
  assert.equal(
    titleInput.value,
    'Y title edited by user',
    "note Y's edited title must survive a stale reload() resolving for the abandoned note X"
  );
  assert.equal(
    bodyTextarea.value,
    'Y body edited by user',
    "note Y's edited body must survive a stale reload() resolving for the abandoned note X"
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
