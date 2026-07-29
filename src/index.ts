/**
 * Shared Editor Kit (SEK) — public TypeScript interface.
 *
 * Started as a type-only module; component implementations land per-feature
 * as they're built (SEK-03 first). The goal of this package is to define
 * the contract that the Student Desktop App (SDA, SDA-19) and the Teacher
 * Web App (TWA, TWA-14) consume — and to let the Backend API team model the
 * data path against a stable shape — before all UI code is written.
 *
 * Feature IDs reference: docs/Campus platform architecture.md, Section 3
 * (SEK-01..05). Every interface here was derived from the EARS requirement
 * and acceptance criteria of its feature row; the comments on each type
 * call out the criterion that drove the shape.
 *
 * Status of the five features:
 *   - SEK-01 (Code editor)            — Must — implemented (CodeEditor).
 *   - SEK-02 (Document viewer)        — Must — implemented (DocumentViewer).
 *   - SEK-03 (Markdown notes)         — Must — implemented (NotesEditor).
 *   - SEK-04 (Built-in image search)  — Could — implemented (ImageSearchPanel,
 *                                       rendered inside NotesEditor via the
 *                                       optional `imageSearch` prop).
 *   - SEK-05 (Inking w/ diagrams)     — Won't, promoted — implemented
 *                                       (DocumentViewer's diagram-ink mode).
 *                                       Shapes are stored as vector points
 *                                       (ShapeAnnotation), reusing the same
 *                                       normalized-page-space primitive
 *                                       InkStroke.points already used.
 *
 * Consumers:
 *   - apps/teacher-web     (TWA) — imports the TS interfaces directly.
 *   - apps/student-desktop (SDA) — Avalonia/.NET consumer; binding generation
 *     is tracked as a separate PR (post-Week 0) since the SDA stack is not
 *     yet scaffolded in this repo.
 *
 * This is a contract-change package per
 * docs/campus-platform-work-division.md Section 6. Any change to a type
 * already declared here requires a post in the shared log and a thumbs-up
 * from the other track before merge.
 */

export type {
  UserContext,
  Result,
  SekError,
  SekErrorCode,
  ReadCallback,
  WriteCallback,
  DeleteCallback,
  InkStroke,
} from './types/common.js';

// SEK-01 — Code editor
export type {
  Language,
  CodeFile,
  CodeProject,
  CodeRunResult,
  CodeEditorProps,
  CodeEditorApi,
} from './code-editor/index.js';
export {
  LANGUAGE_LABELS,
  CodeEditor,
  isSupportedLanguage,
  inferLanguageFromExtension,
  validateProject,
  buildStarterProject,
} from './code-editor/index.js';

// SEK-02 — Document viewer & annotator
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
} from './document-viewer/index.js';
export { DocumentViewer } from './document-viewer/index.js';

// SEK-03 — Markdown notes
export type {
  Note,
  NoteLink,
  NoteLinkRef,
  OutgoingLinks,
  Backlinks,
  NotesEditorProps,
  NotesEditorApi,
} from './notes/index.js';
export { NotesEditor, extractOutgoingLinks } from './notes/index.js';

// SEK-04 — Built-in image search (inside the notes editor)
export type {
  ImageSearchResult,
  ImageSearchResponse,
  ImageInsert,
  ImageSearchProps,
  ImageSearchPanelProps,
} from './image-search/index.js';
export { ImageSearchPanel } from './image-search/index.js';
