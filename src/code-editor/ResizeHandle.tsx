/**
 * SEK-01 — drag handle for resizing an adjacent pane (sidebar width, output panel height).
 *
 * All the actual size arithmetic is resizedSize (logic.ts), unit-tested there like the rest
 * of this module's pure logic — this component only wires up pointer events and reports the
 * next size back to CodeEditor.tsx, which owns the width/height state and passes it back down
 * as an inline style on the resized pane. Unstyled beyond a cursor, per SEK's usual convention
 * (sek-host.css/code-host-theme.css supply the actual width/hover-color skin).
 */
import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { resizedSize } from './logic.js';

export interface ResizeHandleProps {
  /** 'vertical' = a vertical line dragged horizontally (resizes a width, e.g. the sidebar).
   *  'horizontal' = a horizontal line dragged vertically (resizes a height, e.g. the output panel). */
  readonly orientation: 'vertical' | 'horizontal';
  readonly size: number;
  readonly min: number;
  readonly max: number;
  readonly onResize: (size: number) => void;
  readonly className: string;
}

export function ResizeHandle({ orientation, size, min, max, onResize, className }: ResizeHandleProps) {
  // The pointermove/pointerup listeners below are attached once per drag gesture rather
  // than re-attached every render, so without this they'd close over whatever size/min/max/
  // onResize were at drag-start time instead of the latest render's.
  const latest = useRef({ size, min, max, onResize });
  latest.current = { size, min, max, onResize };

  const startDragging = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startPointer = orientation === 'vertical' ? e.clientX : e.clientY;
    const startSize = latest.current.size;

    const handleMove = (moveEvent: PointerEvent) => {
      const pointer = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
      const delta = pointer - startPointer;
      // The output panel's handle sits above the panel, so dragging it up (a negative
      // vertical delta) must grow the panel's height — invert delta for that orientation.
      const signedDelta = orientation === 'vertical' ? delta : -delta;
      const { min: currentMin, max: currentMax, onResize: currentOnResize } = latest.current;
      currentOnResize(resizedSize(startSize, signedDelta, currentMin, currentMax));
    };
    const stopDragging = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopDragging);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopDragging);
  };

  return (
    <div
      className={className}
      onPointerDown={startDragging}
      role="separator"
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
    />
  );
}
