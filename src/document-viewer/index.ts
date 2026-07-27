/**
 * SEK-02 — Document viewer & annotator public surface.
 */
export type {
  DocumentType,
  OcrStatus,
  DocumentDescriptor,
  Annotation,
  HighlightAnnotation,
  TextBoxAnnotation,
  InkAnnotation,
  ShapeAnnotation,
  OcrPageResult,
  DocumentViewerProps,
  DocumentViewerApi,
  AnnotationChange,
} from './types.js';
export type { InkStroke } from '../types/common.js';

// geometry.ts (clamp01, rectFromPoints, isRectSizable, isStrokeSizable) is an
// internal implementation detail of DocumentViewer's pointer-drag handling,
// not part of the SEK-02 contract — it's deliberately not re-exported here.
// Its own NormalizedRect/Point types are intentionally separate from the
// contract's NormalizedRect in ./types.ts for the same reason.
export { DocumentViewer } from './DocumentViewer.js';
