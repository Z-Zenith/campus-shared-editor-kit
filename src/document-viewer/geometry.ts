/**
 * SEK-02 — pure geometry helpers for the annotation overlay.
 *
 * Framework-agnostic on purpose (no React, no DOM types) so it can be
 * unit-tested directly, matching the pattern in ../notes/linkExtraction.ts.
 *
 * All coordinates are normalized to 0..1 page space (see the "Annotation
 * coordinates are normalized 0..1" design rule in README.md) so this module
 * never needs to know the rendered page's pixel size.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Below this width/height, a dragged rectangle is treated as a stray click, not a shape. */
export const MIN_RECT_SIZE = 0.01;

/** Below this total displacement, an ink drag is treated as a stray click/tap, not a stroke. */
export const MIN_STROKE_LENGTH = 0.01;

/** Clamp a coordinate into the normalized 0..1 page space. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Builds a normalized rect from two drag corners, regardless of drag direction. */
export function rectFromPoints(a: Point, b: Point): NormalizedRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Rejects rects too small to be an intentional highlight/text-box drag (a stray click). */
export function isRectSizable(rect: NormalizedRect): boolean {
  return rect.width >= MIN_RECT_SIZE && rect.height >= MIN_RECT_SIZE;
}

/**
 * Rejects ink strokes too short to be an intentional drag (a stray click/tap).
 * Point count alone isn't enough — pointer jitter on a tap can still fire two
 * or more move events at (near-)identical coordinates, so this also requires
 * some point to have actually moved away from the start.
 */
export function isStrokeSizable(points: ReadonlyArray<Point>): boolean {
  if (points.length < 2) return false;
  const first = points[0]!;
  return points.some((p) => Math.hypot(p.x - first.x, p.y - first.y) >= MIN_STROKE_LENGTH);
}

/**
 * SEK-05 — snaps a point to the nearest intersection of a uniform grid in
 * the same 0..1 page space every other annotation coordinate uses. The
 * caller (DocumentViewer's `GRID_SIZE` constant) owns the actual grid size —
 * this stays a pure function of `gridSize` so it's testable the same way as
 * the rest of this module, without importing a component-level constant.
 *
 * Applied on commit (pointer-up), not while dragging, so the live draft
 * preview still tracks the pointer exactly and only the final shape jumps
 * to the grid — that's what reads as "snapping to a light grid" rather than
 * a hard constraint on the drag itself.
 *
 * Re-clamped through `clamp01` afterward: rounding to the nearest multiple
 * of `gridSize` can overshoot past 1 when `gridSize` doesn't evenly divide
 * the 0..1 range (e.g. a point at 1 with gridSize 0.6 rounds to 1.2).
 */
export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: clamp01(Math.round(point.x / gridSize) * gridSize),
    y: clamp01(Math.round(point.y / gridSize) * gridSize),
  };
}
