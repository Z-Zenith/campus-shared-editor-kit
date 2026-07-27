/**
 * Cross-cutting types for the Shared Editor Kit (SEK).
 *
 * These types are shared by every SEK-* feature module (code-editor, document-viewer,
 * notes, image-search) and are the minimum surface an embedder (TWA, SDA) needs in
 * order to render a SEK component. They are intentionally framework-agnostic — no
 * React, no DOM types leak in here.
 *
 * Feature IDs reference: docs/Campus platform architecture.md, Section 3 (SEK-01..05).
 */

/** Opaque, embedder-supplied authentication context. SEK never opens a session itself. */
export interface UserContext {
  /** Stable per-user ID from the host application's auth layer. */
  readonly userId: string;
  /** Active session token to forward to the Backend API. */
  readonly sessionToken: string;
  /** Role used to gate write operations (annotation, note edit, code run). */
  readonly role: 'student' | 'teacher' | 'admin' | 'parent';
  /** College tenant — every persisted entity is scoped to one college. */
  readonly collegeId: string;
}

/** Standard Result envelope so SEK callers can handle errors without try/catch. */
export type Result<TValue, TError = SekError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

/** Canonical error shape returned by every SEK API call. */
export interface SekError {
  /** Stable error code so the embedder can branch on it (e.g. show a toast). */
  readonly code: SekErrorCode;
  /** Human-readable message — safe to show to end users. */
  readonly message: string;
  /** Optional cause for logging; never shown to end users. */
  readonly cause?: unknown;
}

/** Closed set of error codes. Adding a new code is a contract change. */
export type SekErrorCode =
  | 'unsupported_language'        // SEK-01 — language not in the launch list
  | 'code_execution_failed'       // SEK-01 — Code Execution Service returned an error
  | 'unsupported_document_type'   // SEK-02 — doc type not in {pdf, pptx, docx}
  | 'document_not_found'          // SEK-02
  | 'note_not_found'              // SEK-03 — link to a deleted note resolves to this
  | 'image_search_unavailable'    // SEK-04
  | 'network_error'               // generic transport failure
  | 'unauthorized'                // session expired / wrong role
  | 'validation_error';           // embedder passed bad props

/** Async read callback the embedder supplies so SEK doesn't own persistence. */
export type ReadCallback<TEntity> = (id: string) => Promise<Result<TEntity>>;

/** Async write callback the embedder supplies so SEK doesn't own persistence. */
export type WriteCallback<TEntity> = (entity: TEntity) => Promise<Result<TEntity>>;

/** Async delete callback the embedder supplies so SEK doesn't own persistence. */
export type DeleteCallback = (id: string) => Promise<Result<void>>;

/**
 * One stroke is a sequence of points in normalized 0..1 page space. Lives
 * here (not in document-viewer) because SEK-05 (inking w/ diagrams, now
 * implemented) reuses this same normalized-point coordinate primitive for
 * its ShapeAnnotation start/end fields (document-viewer/types.ts) — shapes
 * store just the two defining points rather than a full InkStroke, since
 * they're vector shapes, not freehand strokes.
 */
export interface InkStroke {
  readonly color: string;
  readonly width: number; // in CSS pixels at 1x zoom
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}
