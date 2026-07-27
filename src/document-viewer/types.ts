/**
 * SEK-02 — Document viewer & annotator public interface.
 *
 * Spec: docs/Campus platform architecture.md, Section 3 (SEK-02).
 *   "View and annotate PDF, PPTX, DOCX with highlight, text box, ink, and basic OCR
 *    (moved from SDA-06)."
 *
 * Acceptance criteria this interface MUST enforce:
 *   - "Highlight/text-box/ink annotations persist on reopening the same PDF" —
 *     Annotation is a first-class persisted entity; the embedder supplies the
 *     onAnnotationChange callback so the Backend API stores it, and the
 *     initialAnnotations prop re-hydrates on reopen.
 *   - PDF / PPTX / DOCX are the only supported types at launch. Annotation is
 *     PDF-only per spec ("annotate PDFs with highlights, text boxes, ink, and
 *     basic OCR") — other doc types are view-only.
 */

import type { InkStroke, Result, SekError, UserContext } from '../types/common.js';

/** Document types supported at launch. Adding one is a contract change. */
export type DocumentType = 'pdf' | 'pptx' | 'docx';

/**
 * OCR lifecycle state, mirroring the `documents.ocr_status` column
 * (docs/campus-platform-db-api-schema.md Section 1.9). PDF only —
 * `not_applicable` for pptx/docx.
 */
export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'not_applicable';

/** Per-document-type metadata. */
export interface DocumentDescriptor {
  readonly id: string;
  readonly type: DocumentType;
  /**
   * Display title. Optional: the `documents` table has no `title` column
   * today (see db-api-schema.md Open Items — whether this should be
   * derived from `fileUrl` by the embedder is still an open question).
   * Embedders must not assume a round-trippable, persisted title yet.
   */
  readonly title?: string;
  /** GCS / object-store URL the embedder resolves through the Backend API (API-03). */
  readonly fileUrl: string;
  /** Page count, if known. PDF only. */
  readonly pageCount?: number;
  /** OCR lifecycle state. PDF only; `not_applicable` for pptx/docx. */
  readonly ocrStatus?: OcrStatus;
}

/**
 * Annotation is PDF-only per the spec.
 *
 * ShapeAnnotation is SEK-05 ("Inking with basic block diagrams", promoted
 * from Won't — spec: "Extend ink annotation with Paint-style basic
 * shapes/block-diagram drawing"). Other doc types are view-only.
 */
export type Annotation =
  | HighlightAnnotation
  | TextBoxAnnotation
  | InkAnnotation
  | ShapeAnnotation;

/** Coordinates use the PDF's intrinsic coordinate space (0..1 normalized). */
interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A single 0..1 normalized page-space coordinate. Structurally identical to
 * document-viewer/geometry.ts's own `Point` — duplicated locally the same
 * way `NormalizedRect` above is, so this public contract file doesn't
 * import an internal implementation-detail module (see geometry.ts's and
 * document-viewer/index.ts's comments on why that split exists).
 */
interface Point {
  readonly x: number;
  readonly y: number;
}

export interface HighlightAnnotation {
  readonly kind: 'highlight';
  readonly id: string;
  readonly page: number;
  readonly rect: NormalizedRect;
  /** Hex color, e.g. "#FFEB3B". */
  readonly color: string;
  /** Optional note attached to the highlight. */
  readonly note?: string;
  readonly createdAt: string; // ISO 8601
  readonly createdBy: string; // user id
}

export interface TextBoxAnnotation {
  readonly kind: 'textBox';
  readonly id: string;
  readonly page: number;
  readonly position: NormalizedRect;
  readonly text: string;
  /** Hex color of the text. */
  readonly color: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface InkAnnotation {
  readonly kind: 'ink';
  readonly id: string;
  readonly page: number;
  /** Vector stroke list — diagrams (SEK-05) reuse the same vector primitive. */
  readonly strokes: ReadonlyArray<InkStroke>;
  readonly createdAt: string;
  readonly createdBy: string;
}

/**
 * SEK-05 — a diagram-mode shape drawn in "diagram-ink mode": rectangle,
 * arrow, or line. Unlike `InkAnnotation`'s freehand `strokes` (a raster-ish
 * point list), a shape is stored as just its two defining vector points —
 * "stored as vector shapes (not raster ink) so they can be resized later"
 * per the spec — so a resize is just moving `start`/`end`, not re-drawing.
 * `start`/`end` are in the same normalized 0..1 page space as every other
 * Annotation kind (see `NormalizedRect` above and `InkStroke.points`).
 */
export interface ShapeAnnotation {
  readonly kind: 'shape';
  readonly id: string;
  readonly page: number;
  readonly shapeType: 'rectangle' | 'arrow' | 'line';
  readonly start: Point;
  readonly end: Point;
  readonly createdAt: string;
  readonly createdBy: string;
}

/** Result of a single OCR pass on a page. */
export interface OcrPageResult {
  readonly page: number;
  readonly text: string;
  /** Per-word bounding boxes, normalized 0..1 page space. */
  readonly words: ReadonlyArray<{
    readonly text: string;
    readonly rect: NormalizedRect;
    readonly confidence: number;
  }>;
}

export interface DocumentViewerProps {
  readonly user: UserContext;
  readonly document: DocumentDescriptor;
  /** Annotations to re-hydrate on open — drives the "persist on reopen" criterion. */
  readonly initialAnnotations: ReadonlyArray<Annotation>;
  /** Whether the user can add/edit annotations. Read-only review otherwise. */
  readonly canAnnotate: boolean;
  /** Whether the user can run OCR. */
  readonly canOcr: boolean;
  /**
   * Persist an annotation (create, update, delete). The embedder forwards to
   * the Backend API which writes the JSONB `annotations` column on `documents`
   * (see docs/campus-platform-db-api-schema.md Section 1.9).
   */
  readonly onAnnotationChange: (
    change: AnnotationChange,
  ) => Promise<Result<Annotation, SekError>>;
  /**
   * Run OCR on a single page. The embedder forwards to the AI Services
   * container. The "basic OCR" promised in the spec is intentionally narrow
   * — the embedder should display a "best-effort" hint next to the result.
   */
  readonly onOcrPage: (page: number) => Promise<Result<OcrPageResult, SekError>>;
}

export type AnnotationChange =
  | { readonly op: 'create'; readonly annotation: Annotation }
  | { readonly op: 'update'; readonly annotation: Annotation }
  | { readonly op: 'delete'; readonly id: string };

export interface DocumentViewerApi {
  /** Navigate to a specific page. 1-indexed. */
  goToPage(page: number): void;
  /** Read out all current annotations. */
  getAnnotations(): ReadonlyArray<Annotation>;
}
