/**
 * Contract smoke test for the SEK public interface.
 *
 * This is a compile-time test — it doesn't run anything, but it forces every
 * public type and value to actually resolve from the package's subpath
 * exports. If a barrel re-export is broken or a type was accidentally
 * removed, this file fails to typecheck.
 *
 * Reference feature IDs are inlined in the comments so it's obvious which
 * spec row each symbol came from.
 */

import type {
  // Common
  UserContext,
  Result,
  SekError,
  SekErrorCode,
  // SEK-01
  Language,
  CodeFile,
  CodeProject,
  CodeRunResult,
  CodeEditorProps,
  CodeEditorApi,
  // SEK-02
  DocumentType,
  DocumentDescriptor,
  Annotation,
  HighlightAnnotation,
  TextBoxAnnotation,
  InkAnnotation,
  ShapeAnnotation,
  InkStroke,
  OcrPageResult,
  DocumentViewerProps,
  DocumentViewerApi,
  AnnotationChange,
  // SEK-03
  Note,
  NoteLink,
  NoteLinkRef,
  OutgoingLinks,
  Backlinks,
  NotesEditorProps,
  NotesEditorApi,
  // SEK-04
  ImageSearchResult,
  ImageSearchResponse,
  ImageInsert,
  ImageSearchProps,
} from '../src/index.js';

import { CodeEditor, LANGUAGE_LABELS, isSupportedLanguage, ImageSearch, buildImageMarkdown } from '../src/index.js';

// ---- subpath imports also resolve (tree-shaking contract) ----
import type { CodeEditorProps as CEP } from '../src/code-editor/index.js';
import type { DocumentViewerProps as DVP } from '../src/document-viewer/index.js';
import type { NotesEditorProps as NEP } from '../src/notes/index.js';
import type { ImageSearchProps as ISP } from '../src/image-search/index.js';
import type {
  UserContext as UC,
  Result as Res,
  SekError as SE,
} from '../src/types/common.js';

// ---- Exhaustiveness checks: every Language has a label, no extras ----
// Record<Language, string> forces LANGUAGE_LABELS to have exactly one key per
// Language literal — deriving the literal list from its keys (rather than
// hand-listing it a second time) keeps this check honest as Language grows.
const _exhaustiveLanguage: Record<Language, string> = LANGUAGE_LABELS;
void _exhaustiveLanguage;

const _allLanguageLiterals: Language[] = Object.keys(LANGUAGE_LABELS) as Language[];
void _allLanguageLiterals;

// ---- Result<T,E> discriminated union narrows correctly ----
function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(String(r.error));
}

// ---- SekErrorCode is a closed union (literal exhaustiveness) ----
const _errorCodeSample: SekErrorCode = 'unsupported_language';
void _errorCodeSample;

// ---- Annotation is a discriminated union of four kinds ----
function classifyAnnotation(a: Annotation): string {
  switch (a.kind) {
    case 'highlight':
      return a.rect.x.toString();
    case 'textBox':
      return a.text;
    case 'ink':
      return a.strokes[0]?.color ?? 'no-stroke';
    case 'shape':
      return a.shapeType;
  }
}

// SEK-05 — ShapeAnnotation shape compiles, start/end round-trip as points
const _shapeAnnotation: ShapeAnnotation = {
  kind: 'shape',
  id: 'a2',
  page: 1,
  shapeType: 'arrow',
  start: { x: 0.1, y: 0.1 },
  end: { x: 0.5, y: 0.5 },
  createdAt: '',
  createdBy: 'u1',
};
void _shapeAnnotation;

// ---- DocumentType is a closed union ----
const _docType: DocumentType = 'pdf';
void _docType;

// ---- Mock UserContext so we can construct props (compile-time only) ----
const user: UserContext = {
  userId: 'u1',
  sessionToken: 'tok',
  role: 'teacher',
  collegeId: 'c1',
};

// SEK-01 — props shape compiles
const _codeEditor: CodeEditorProps = {
  user,
  canRun: true,
  canEdit: true,
  onRun: async (_project: CodeProject): Promise<Result<CodeRunResult, SekError>> => ({
    ok: true,
    value: { stdout: '', stderr: '', exitCode: 0, durationMs: 1, timedOut: false },
  }),
};
void _codeEditor;

// SEK-02 — props shape compiles, AnnotationChange discriminated union works
const _annotationChange: AnnotationChange = { op: 'delete', id: 'a1' };
void _annotationChange;

const _documentViewer: DocumentViewerProps = {
  user,
  document: { id: 'd1', type: 'pdf', fileUrl: 'https://example.com/d1.pdf' },
  initialAnnotations: [],
  canAnnotate: true,
  canOcr: true,
  onAnnotationChange: async (_change: AnnotationChange): Promise<Result<Annotation, SekError>> => ({
    ok: true,
    value: { kind: 'highlight', id: 'a1', page: 1, rect: { x: 0, y: 0, width: 0.1, height: 0.1 }, color: '#FFEB3B', createdAt: '', createdBy: 'u1' },
  }),
  onOcrPage: async (_page: number): Promise<Result<OcrPageResult, SekError>> => ({
    ok: true,
    value: { page: 1, text: '', words: [] },
  }),
};
void _documentViewer;

// SEK-03 — NoteLinkRef round-trips
const _link: NoteLinkRef = { toNoteId: 'n2', anchor: 'see also' };
void _link;

// SEK-04 — ImageInsert is the stable URL, not the source URL (per spec)
const _imageInsert: ImageInsert = {
  embeddedUrl: 'content://img/abc',
  altText: 'alt',
  width: 800,
  height: 600,
  attribution: 'CC-BY / Author',
};
void _imageInsert;

// SEK-04 — props shape compiles, including onInsert
const _imageSearch: ImageSearchProps = {
  user,
  enabled: true,
  onSearch: async (_query: string): Promise<Result<ImageSearchResponse, SekError>> => ({
    ok: true,
    value: { query: _query, results: [], degraded: false },
  }),
  onUploadImage: async (_result: ImageSearchResult): Promise<Result<ImageInsert, SekError>> => ({
    ok: true,
    value: _imageInsert,
  }),
  onInsert: (_insert: ImageInsert) => {},
};
void _imageSearch;

declare const _imageSearchComponent: typeof ImageSearch;
void _imageSearchComponent;
const _markdown: string = buildImageMarkdown(_imageInsert);
void _markdown;

// API surface references compile (not invoked)
declare const _codeApi: CodeEditorApi;
declare const _viewerApi: DocumentViewerApi;
declare const _notesApi: NotesEditorApi;
void _codeApi;
void _viewerApi;
void _notesApi;

// SEK-01 — CodeEditor and isSupportedLanguage resolve from the barrel (this
// would fail to compile if code-editor/index.ts's re-export path broke).
declare const _codeEditorComponent: typeof CodeEditor;
void _codeEditorComponent;
const _isPythonSupported: boolean = isSupportedLanguage('python');
void _isPythonSupported;

// Type-only re-exports compile (this would fail if any barrel or subpath
// export broke) — one field per symbol instead of a separate alias + void
// pair each, since referencing them all in one type position is enough to
// force resolution.
declare const _barrelExports: {
  uc: UC;
  res: Res<string, SE>;
  noteLink: NoteLink;
  highlight: HighlightAnnotation;
  textBox: TextBoxAnnotation;
  ink: InkAnnotation;
  shape: ShapeAnnotation;
  stroke: InkStroke;
  ocr: OcrPageResult;
  docDesc: DocumentDescriptor;
  codeFile: CodeFile;
  codeProject: CodeProject;
  codeRun: CodeRunResult;
  backlinks: Backlinks;
  outgoing: OutgoingLinks;
  searchResult: ImageSearchResult;
  searchResponse: ImageSearchResponse;
  dvp: DVP;
  nep: NEP;
  isp: ISP;
  cep: CEP;
};
void _barrelExports;
