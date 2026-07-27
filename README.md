# @campus/shared-editor-kit

Public TypeScript interface for the **Shared Editor Kit (SEK)** — the cross-container component consumed by the **Student Desktop App** (SDA, `SDA-19`) and the **Teacher Web App** (TWA, `TWA-14`).

> **Status: interfaces defined, components land per-feature.** This package ships the contract for every SEK feature; runtime components are implemented one feature at a time as each is picked up. Defining the interface up front is a `docs/campus-platform-work-division.md` Section 2 Week 0 item — it unblocks both tracks before all editor UI is built.

## Features covered

| ID | Feature | Status in this package |
|---|---|---|
| [SEK-01](../docs/Campus%20platform%20architecture.md#features--shared-editor-kit-sek) | Code editor (C, C++, Python, Java, .NET, HTML, CSS, JS/TS, Node, SQL, JSON, YAML) | **Implemented** — `CodeEditor` (Monaco-powered, multi-file) + `isSupportedLanguage` |
| [SEK-02](../docs/Campus%20platform%20architecture.md#features--shared-editor-kit-sek) | Document viewer & annotator (PDF/PPTX/DOCX, highlights/textboxes/ink, OCR) | **Implemented** — `DocumentViewer` |
| [SEK-03](../docs/Campus%20platform%20architecture.md#features--shared-editor-kit-sek) | Markdown notes (Obsidian-style linked notes) | **Implemented** — `NotesEditor` + `extractOutgoingLinks` |
| [SEK-04](../docs/Campus%20platform%20architecture.md#features--shared-editor-kit-sek) | Built-in image search (inside the notes editor) | Interface only |
| [SEK-05](../docs/Campus%20platform%20architecture.md#features--shared-editor-kit-sek) | Inking w/ block diagrams | **Implemented** — `DocumentViewer`'s opt-in diagram-ink mode (`ShapeAnnotation`) |

## Consumers

- **TWA (React + TypeScript):** imports types directly from this package.
- **SDA (Avalonia / .NET 10):** integrated via a NativeWebView host bundle, not a C# binding. `apps/student-desktop/StudentDesktop.csproj` copies `dist/host/**` (built by `npm run build:host`) into the app's output under `SekHost/`, and SDA-19's `NotesEditor` loads there through `Avalonia.Controls.WebView`. Building `dist/host/**` before `dotnet build` is a manual dev prerequisite for now — not yet wired into a cross-toolchain CI step (tracked as a follow-up).

## Usage

```ts
import {
  CodeEditorProps,
  CodeProject,
  Language,
  LANGUAGE_LABELS,
  Note,
  DocumentDescriptor,
  Annotation,
  Result,
  SekError,
} from '@campus/shared-editor-kit';
```

Subpath imports are also available for tree-shaking:

```ts
import type { CodeEditorProps, Language } from '@campus/shared-editor-kit/code-editor';
import type { DocumentViewerProps, Annotation } from '@campus/shared-editor-kit/document-viewer';
import type { NotesEditorProps, Note } from '@campus/shared-editor-kit/notes';
import type { ImageSearchProps } from '@campus/shared-editor-kit/image-search';
import type { UserContext, Result, SekError } from '@campus/shared-editor-kit/types';
```

## Design rules baked into the interface

These are the non-obvious decisions that came from the EARS requirements and acceptance criteria. Embedders (TWA, SDA) and the component implementor should follow them when the runtime code lands:

1. **Closed language list for SEK-01.** `Language` is a TypeScript string-literal union. The runtime surface returns `Result<CodeRunResult, SekError>` with `code: 'unsupported_language'` for any value not on the list — this enforces the spec's "a language outside the launch list shows a clear 'unsupported language' error, not a silent failure" acceptance criterion. Each `CodeFile` in a `CodeProject` carries its own `Language` (one file = one language; the project as a whole has no single language) since a natural project — e.g. HTML+CSS+JS — mixes them; `CodeProject.entryFilePath` is the file whose language selects the Code Execution Service's runner.
2. **SEK owns no persistence.** Every persistable entity is passed through a callback the embedder supplies (`onSave`, `onDelete`, `onAnnotationChange`, `onUploadImage`, …). `CodeEditorProps.onSave` is optional — when the embedder omits it, Save is a no-op and the editor behaves as a scratch surface (its pre-0.2.0 default). The Backend API remains the source of truth; the table layout in `docs/campus-platform-db-api-schema.md` Part 1.9 (`notes`, `note_links`, `documents`, `code_projects`, `code_files`) is what these callbacks write to.
3. **SEK owns no auth.** Every component takes a `UserContext` and forwards the session token; SEK never opens or refreshes a session itself.
4. **Wikilink resolution is `Result<Note, SekError>`, not a thrown exception.** This is the contract that backs SEK-03's "links resolve to not-found, not a crash" acceptance criterion.
5. **Image search returns a `content-addressed` URL, not the original `sourceUrl`.** This is the contract for SEK-04's "inserted image is embedded, not just linked" acceptance criterion. The embedder's `onUploadImage` is the step that makes the image survive the source going away.
6. **Annotation coordinates are normalized 0..1.** Survives zoom, retina displays, and PDF re-renders. The renderer in the embedder multiplies by the rendered page size.
7. **`InkStroke` is a vector primitive, defined in `types/common.ts`** (not `document-viewer`) precisely so SEK-05 can import it without reaching into SEK-02's module. SEK-05's `ShapeAnnotation` reuses the same normalized-point coordinate convention for its `start`/`end` fields — "stored as vector shapes, not raster ink" — even though it stores just the two defining points rather than a full `InkStroke`.
8. **Diagram-ink mode is opt-in, not always-on.** Per the EARS wording ("Where diagram-ink mode is enabled...") the 3 shape tools (rectangle/arrow/line) only appear in the toolbar once the user flips a `diagramInkMode` toggle — they don't sit alongside highlight/textBox/ink by default.
9. **Shapes snap to a grid on commit, not while dragging.** `DocumentViewer`'s `GRID_SIZE` constant (0.02, in the same 0..1 viewBox space as `INK_WIDTH`) is applied to `start`/`end` at pointer-up via `geometry.ts`'s `snapToGrid`, so the live drag preview still tracks the pointer exactly and only the committed shape jumps to the grid.

## Contract change protocol

This package is on the shared-contract list (`docs/campus-platform-work-division.md` Section 6). Any change to a type already declared here — adding a new `Language`, changing an `Annotation.kind`, renaming a callback, etc. — requires a post in the shared log and a thumbs-up from the other track before merge.

## Scripts

```bash
pnpm typecheck     # tsc --noEmit — verifies the contract compiles in isolation
pnpm build         # tsc — emits .d.ts + .js to ./dist (kept out of git)
pnpm test          # typecheck, then runs runtime tests (tests/*.test.ts) via `node --test`
```

Runtime tests use Node's built-in test runner directly against `.ts` sources (Node 22+ type
stripping) rather than adding a separate test-framework dependency — see
`tests/notes.linkExtraction.test.ts`, `tests/code-editor.logic.test.ts`, and
`tests/document-viewer.geometry.test.ts` for the pattern: framework-agnostic logic (link
extraction, language-support guards, overlay geometry) gets a runtime test; the React
component itself is exercised by the embedder's own test suite (no DOM test renderer is a
devDependency here yet). `tests/contract.smoke.ts` only verifies that the public exports
(types and values) resolve through the barrel — it is not a substitute for rendering
coverage. Component-level (React rendering) tests for SEK-01/02/04 land as a follow-up once a
DOM-testing dependency is added to the package.

## Notes on the DocumentViewer implementation (SEK-02)

- **Rendering strategy.** The document itself is shown via an `<iframe>` pointing at
  `DocumentDescriptor.fileUrl` (the browser's native PDF/Office viewer), not a custom
  PDF.js-style renderer — no such rendering dependency exists in this package yet, and the
  acceptance criterion is about annotation *persistence*, not pixel-perfect rendering. An SVG
  overlay (`viewBox="0 0 1 1"`) sits on top for the annotation shapes, which is what makes the
  normalized 0..1 coordinates in `Annotation` resolution-independent.
- **Annotation is PDF-only**, per spec — the pointer-drag overlay and OCR controls only mount
  when `document.type === 'pdf'`; pptx/docx render view-only with a hint explaining why.
- **OCR is scoped to triggering + rendering `onOcrPage`'s result**, labeled "best-effort" in
  the UI per the spec's "basic OCR" framing. The actual OCR model lives in the AI Services
  container — this component only calls the embedder-supplied callback and shows what comes
  back.

## Notes on diagram-ink mode (SEK-05)

- **Opt-in, gated behind a toggle.** The rectangle/arrow/line tool buttons only render in the
  toolbar once "Diagram-ink mode" is checked — they aren't always-on alongside highlight/textBox/ink.
- **Shapes are vector, not raster ink.** A `ShapeAnnotation` stores only its two defining
  points (`start`/`end`), unlike `InkAnnotation`'s freehand point list — a future resize just
  moves those two points instead of re-drawing.
- **Grid-snapping happens on commit.** Both endpoints are snapped to the nearest multiple of
  `GRID_SIZE` (0.02, in the same 0..1 viewBox space as `INK_WIDTH`) in the pointer-up handler,
  via `geometry.ts`'s `snapToGrid`. The live draft preview while dragging is intentionally
  unsnapped, so the shape tracks the pointer exactly until it's released.
- **Arrows render via an SVG `<marker>`**, sized off `GRID_SIZE` so the arrowhead reads as
  roughly one grid cell regardless of the shape's own stroke width.
