/**
 * SEK-02 — runtime tests for the annotation-overlay geometry helpers.
 *
 * Uses Node's built-in test runner directly against TypeScript sources,
 * same pattern as tests/notes.linkExtraction.test.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp01,
  isRectSizable,
  isStrokeSizable,
  rectFromPoints,
  snapToGrid,
} from '../src/document-viewer/geometry.ts';

test('clamp01 leaves in-range values untouched', () => {
  assert.equal(clamp01(0.5), 0.5);
});

test('clamp01 clamps below 0 up to 0', () => {
  assert.equal(clamp01(-0.2), 0);
});

test('clamp01 clamps above 1 down to 1', () => {
  assert.equal(clamp01(1.4), 1);
});

test('clamp01 treats NaN as 0 rather than propagating it', () => {
  assert.equal(clamp01(Number.NaN), 0);
});

test('rectFromPoints builds a rect regardless of drag direction', () => {
  const rect = rectFromPoints({ x: 0.7, y: 0.6 }, { x: 0.2, y: 0.3 });
  assert.equal(rect.x, 0.2);
  assert.equal(rect.y, 0.3);
  // Float subtraction (0.7 - 0.2) isn't exact — assert within a tight tolerance
  // rather than bit-for-bit, since the geometry itself (not floating point) is
  // what this test is verifying.
  assert.ok(Math.abs(rect.width - 0.5) < 1e-9);
  assert.ok(Math.abs(rect.height - 0.3) < 1e-9);
});

test('rectFromPoints on identical points yields a zero-size rect', () => {
  const rect = rectFromPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
  assert.deepEqual(rect, { x: 0.5, y: 0.5, width: 0, height: 0 });
});

test('isRectSizable rejects a stray-click-sized rect', () => {
  assert.equal(isRectSizable({ x: 0, y: 0, width: 0.001, height: 0.001 }), false);
});

test('isRectSizable accepts a deliberately dragged rect', () => {
  assert.equal(isRectSizable({ x: 0, y: 0, width: 0.1, height: 0.1 }), true);
});

test('isRectSizable rejects when only one dimension is too small', () => {
  assert.equal(isRectSizable({ x: 0, y: 0, width: 0.1, height: 0.001 }), false);
});

test('isStrokeSizable rejects a single-point tap', () => {
  assert.equal(isStrokeSizable([{ x: 0.1, y: 0.1 }]), false);
});

test('isStrokeSizable rejects an empty stroke', () => {
  assert.equal(isStrokeSizable([]), false);
});

test('isStrokeSizable accepts a two-point drag', () => {
  assert.equal(isStrokeSizable([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]), true);
});

test('isStrokeSizable rejects duplicate-point jitter (pointer taps that still fire 2+ move events)', () => {
  assert.equal(
    isStrokeSizable([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }]),
    false
  );
});

test('isStrokeSizable accepts many points that never individually move far but drift past the threshold', () => {
  const points = Array.from({ length: 5 }, (_, i) => ({ x: 0.5 + i * 0.005, y: 0.5 }));
  assert.equal(isStrokeSizable(points), true);
});

// ---- snapToGrid (SEK-05 — diagram-mode shapes snap on commit) ----

test('snapToGrid snaps a point down to the nearest grid line', () => {
  const snapped = snapToGrid({ x: 0.137, y: 0.264 }, 0.02);
  assert.ok(Math.abs(snapped.x - 0.14) < 1e-9, `expected ~0.14, got ${snapped.x}`);
  assert.ok(Math.abs(snapped.y - 0.26) < 1e-9, `expected ~0.26, got ${snapped.y}`);
});

test('snapToGrid rounds to the nearest grid line, not just down', () => {
  // 0.03 sits exactly halfway between the 0.02 and 0.04 grid lines when the
  // grid size is 0.02 — Math.round's "round half up" behavior should pick 0.04.
  const snapped = snapToGrid({ x: 0.03, y: 0.03 }, 0.02);
  assert.ok(Math.abs(snapped.x - 0.04) < 1e-9, `expected ~0.04, got ${snapped.x}`);
});

test('snapToGrid leaves a point already on the grid untouched', () => {
  const snapped = snapToGrid({ x: 0.4, y: 0.6 }, 0.02);
  assert.ok(Math.abs(snapped.x - 0.4) < 1e-9);
  assert.ok(Math.abs(snapped.y - 0.6) < 1e-9);
});

test('snapToGrid collapses two nearby points to the same grid intersection', () => {
  // Simulates a near-zero-size drag that should read as degenerate once
  // snapped, even though the raw start/end weren't identical.
  const a = snapToGrid({ x: 0.201, y: 0.201 }, 0.02);
  const b = snapToGrid({ x: 0.205, y: 0.205 }, 0.02);
  assert.deepEqual(a, b);
});

test('snapToGrid re-clamps into 0..1 when rounding would overshoot', () => {
  // 1 / 0.6 = 1.667, which rounds up to 2 grid steps (1.2) — outside 0..1
  // without the clamp01 safety net.
  const snapped = snapToGrid({ x: 1, y: 1 }, 0.6);
  assert.equal(snapped.x, 1);
  assert.equal(snapped.y, 1);
});
