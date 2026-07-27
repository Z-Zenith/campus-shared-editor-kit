/**
 * SEK-02 — regression coverage for commitChange()'s stale-write race.
 *
 * document-viewer.geometry.test.ts only exercises the pure geometry helpers
 * — no test here previously mounted DocumentViewer with a real DOM render
 * and re-rendered it with a changed `document` prop, so none could have
 * caught this: commitChange() had no guard against the embedder switching
 * documents while an annotation save for the *previous* document was still
 * in flight, so its resolution could silently attach that annotation to
 * whatever document the user had since opened.
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
const { DocumentViewer } = await import('../dist/document-viewer/DocumentViewer.js');

const user = { userId: 'teacher-1', sessionToken: 'tok', role: 'teacher', collegeId: 'college-1' };

const docA = { id: 'doc-A', type: 'pdf', fileUrl: 'https://files.test/a.pdf', pageCount: 1 };
const docB = { id: 'doc-B', type: 'pdf', fileUrl: 'https://files.test/b.pdf', pageCount: 1 };

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('SEK-02: an annotation save still in flight for a since-abandoned document must not land in the newly-opened document', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  // Document A's annotation save is held open under our control so we can
  // switch to document B before it resolves.
  let resolveASave;
  const aSaveGate = new Promise((resolve) => {
    resolveASave = resolve;
  });

  // The highlight's id is a fresh crypto.randomUUID() per draw, so gate by
  // call order (this test only ever draws one highlight, on document A)
  // rather than by a predictable id.
  let firstCall = true;
  const onAnnotationChange = async (change) => {
    if (change.op !== 'create') throw new Error('unexpected op for this test');
    if (firstCall) {
      firstCall = false;
      await aSaveGate;
    }
    return { ok: true, value: change.annotation };
  };
  const onOcrPage = async () => ({ ok: false, error: { code: 'network_error', message: 'n/a' } });

  const ref = createRef();

  // --- Open document A. ---
  await act(async () => {
    root.render(
      React.createElement(DocumentViewer, {
        ref,
        user,
        document: docA,
        initialAnnotations: [],
        canAnnotate: true,
        canOcr: false,
        onAnnotationChange,
        onOcrPage,
      })
    );
    await flushMicrotasks();
  });

  // --- Draw a highlight on document A (its save is held open by the gate). ---
  const surface = container.querySelector('.sek-document-viewer__surface');
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });

  const highlightButton = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Highlight'
  );
  await act(async () => {
    highlightButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

  // Each dispatch gets its own `act()` so React flushes the resulting state
  // update (and DocumentViewer's closures pick up the new `draft`) before the
  // next event fires — dispatching all three synchronously in one `act()`
  // would let handlePointerMove/Up run against the stale pre-pointerdown
  // closure, since no render happens in between.
  await act(async () => {
    surface.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 })
    );
  });
  await act(async () => {
    surface.dispatchEvent(
      new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 40 })
    );
  });
  await act(async () => {
    surface.dispatchEvent(
      new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 40, clientY: 40 })
    );
    await flushMicrotasks();
  });

  // --- Switch to document B before A's annotation save resolves. ---
  await act(async () => {
    root.render(
      React.createElement(DocumentViewer, {
        ref,
        user,
        document: docB,
        initialAnnotations: [],
        canAnnotate: true,
        canOcr: false,
        onAnnotationChange,
        onOcrPage,
      })
    );
    await flushMicrotasks();
  });

  // --- Now let A's annotation save resolve. ---
  await act(async () => {
    resolveASave();
    await flushMicrotasks();
  });

  // The regression: A's stale save resolving must not attach its highlight
  // to document B's annotation list.
  assert.deepEqual(
    ref.current.getAnnotations(),
    [],
    "document B's annotations must stay empty — document A's stale save must not land in it"
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
