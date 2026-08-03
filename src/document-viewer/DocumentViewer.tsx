/**
 * SEK-02 — Document viewer & annotator component.
 *
 * Implements the DocumentViewerProps/DocumentViewerApi contract from ./types.ts.
 * Unstyled on purpose (semantic HTML + stable class hooks only) — SEK owns
 * no styling opinions, the embedder (TWA, SDA) skins it.
 *
 * Annotation is PDF-only per spec: for pptx/docx the component renders the
 * file for viewing but never mounts the pointer-drag overlay or OCR controls.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { SekError } from '../types/common.js';
import type {
  Annotation,
  AnnotationChange,
  DocumentType,
  DocumentViewerApi,
  DocumentViewerProps,
  HighlightAnnotation,
  InkAnnotation,
  OcrPageResult,
  ShapeAnnotation,
  TextBoxAnnotation,
} from './types.js';
import {
  clamp01,
  isRectSizable,
  isStrokeSizable,
  rectFromPoints,
  snapToGrid,
  type NormalizedRect,
  type Point,
} from './geometry.js';

type Tool = 'highlight' | 'textBox' | 'ink' | 'rectangle' | 'arrow' | 'line';

// The 3 diagram-ink-mode shape tools, as a set for cheap "is this tool one of
// the shape tools" checks (e.g. deciding whether to drop the active tool when
// diagram-ink mode is switched off).
const SHAPE_TOOLS: ReadonlySet<Tool> = new Set(['rectangle', 'arrow', 'line']);

type Draft =
  | {
      readonly kind: 'highlight' | 'textBox' | 'rectangle' | 'arrow' | 'line';
      readonly start: Point;
      readonly current: Point;
    }
  | { readonly kind: 'ink'; readonly points: ReadonlyArray<Point> };

const HIGHLIGHT_COLOR = '#FFEB3B';
const INK_COLOR = '#1E88E5';
const INK_WIDTH = 2; // CSS pixels at 1x zoom — see InkStroke.width in types/common.ts
// SEK-05 — diagram-mode shapes share the ink color (they're the "diagram-ink
// mode" extension of ink annotation, not a separate visual language).
const SHAPE_COLOR = INK_COLOR;
// SEK-05 — 0..1 viewBox units (see INK_WIDTH above for this overlay's
// coordinate-space convention). Shapes snap both endpoints to the nearest
// multiple of this on commit, giving a "light" background grid feel rather
// than a hard constraint on the drag itself — 0.02 is 50 lines across the
// page, fine enough not to fight a deliberately-drawn shape, coarse enough
// to visibly align rectangle/arrow/line corners to each other.
const GRID_SIZE = 0.02;
const ARROWHEAD_MARKER_ID = 'sek-document-viewer-arrowhead';
const FALLBACK_SURFACE_WIDTH_PX = 800; // used only until the surface is first measured

// Record<DocumentType, true> forces this to have exactly one key per
// DocumentType literal — if the contract ever grows a 4th document type,
// this fails to compile instead of silently marking it "unsupported" at
// runtime, unlike a hand-written Set would.
const DOCUMENT_TYPE_RECORD: Record<DocumentType, true> = { pdf: true, pptx: true, docx: true };
const KNOWN_DOCUMENT_TYPES: ReadonlySet<string> = new Set(Object.keys(DOCUMENT_TYPE_RECORD));

function newAnnotationId(): string {
  // crypto.randomUUID is available in every embedder runtime we target
  // (browsers, Node 19+, and Avalonia's WebView2/CEF host).
  return globalThis.crypto.randomUUID();
}

export const DocumentViewer = forwardRef<DocumentViewerApi, DocumentViewerProps>(
  function DocumentViewer(
    // Aliased away from `document` — that name would shadow the global DOM
    // `document` object for the rest of the component body.
    { user, document: doc, initialAnnotations, canAnnotate, canOcr, onAnnotationChange, onOcrPage },
    ref
  ) {
    const [page, setPage] = useState(1);
    const [annotations, setAnnotations] = useState<ReadonlyArray<Annotation>>(initialAnnotations);
    const [activeTool, setActiveTool] = useState<Tool | null>(null);
    // SEK-05 — opt-in "diagram-ink mode": per the feature's EARS wording
    // ("Where diagram-ink mode is enabled...") the 3 shape tools are gated
    // behind this toggle rather than always sitting alongside
    // highlight/textBox/ink.
    const [diagramInkMode, setDiagramInkMode] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    // Captures the page a text box was drafted on, alongside its rect — the
    // confirm step can run after the user has navigated to a different page
    // (composing the text takes time), so the page can't be read fresh from
    // the `page` state at confirm-time without mis-attributing the annotation.
    const [pendingTextBox, setPendingTextBox] = useState<{ rect: NormalizedRect; page: number } | null>(null);
    const [textDraft, setTextDraft] = useState('');
    const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<OcrPageResult | null>(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [error, setError] = useState<SekError | null>(null);
    const [surfaceWidthPx, setSurfaceWidthPx] = useState(FALLBACK_SURFACE_WIDTH_PX);

    const surfaceRef = useRef<HTMLDivElement>(null);
    // Imperative-handle methods close over stale state without this — same
    // pattern as NotesEditor's contentRef.
    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;
    // Bumped whenever the page or document changes, so an in-flight OCR
    // request that resolves after the user has already navigated away can
    // recognize itself as stale and skip applying its (now-wrong-page)
    // result instead of silently overwriting whatever the user is now
    // looking at.
    const ocrRequestIdRef = useRef(0);
    // The pointer id that started the current draft. Without this, a second
    // finger touching the surface mid-drag (or any other stray pointer)
    // would feed its coordinates into the same in-progress draft.
    const activePointerIdRef = useRef<number | null>(null);
    // Bumped in the same effect that resets annotations/tools when doc.id or
    // doc.type changes (below). commitChange captures this before awaiting
    // onAnnotationChange and checks it again after — if the embedder swapped
    // the open document while the save was in flight, the continuation is
    // stale and must not apply its result (e.g. an annotation for the
    // previous document) to the new document's annotations state. Same
    // pattern as ocrRequestIdRef above.
    const documentGenerationRef = useRef(0);

    const canAnnotatePdf = canAnnotate && doc.type === 'pdf';
    const canOcrPdf = canOcr && doc.type === 'pdf';

    // Reset the draft whenever the embedder swaps which document is open.
    useEffect(() => {
      setPage(1);
      setAnnotations(initialAnnotations);
      setActiveTool(null);
      setDiagramInkMode(false);
      setDraft(null);
      setPendingTextBox(null);
      setEditingTextBoxId(null);
      setOcrResult(null);
      setOcrLoading(false);
      ocrRequestIdRef.current += 1;
      documentGenerationRef.current += 1;
      setError(KNOWN_DOCUMENT_TYPES.has(doc.type)
        ? null
        : { code: 'unsupported_document_type', message: `Unsupported document type: "${doc.type}".` });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc.id, doc.type]);

    // OCR is only meaningful for the page it was run against — an OCR result
    // from a page the user has since navigated away from would otherwise keep
    // rendering under the new page with no indication it's stale. Bumping the
    // request id also invalidates any OCR call still in flight for the old page.
    useEffect(() => {
      setOcrResult(null);
      setOcrLoading(false);
      ocrRequestIdRef.current += 1;
    }, [page]);

    // The ink-stroke SVG overlay uses a 0..1 viewBox, but InkStroke.width is
    // documented in CSS pixels — measuring the actual rendered surface width
    // is what makes that conversion correct instead of an arbitrary constant.
    useEffect(() => {
      const el = surfaceRef.current;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width) setSurfaceWidthPx(width);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    useImperativeHandle(
      ref,
      (): DocumentViewerApi => ({
        goToPage: (target) => setPage(clampPage(target, doc.pageCount)),
        getAnnotations: () => annotationsRef.current,
      }),
      // Rebind whenever the document identity changes too, not just its page
      // count — two different documents could otherwise share a pageCount
      // and leave a stale closure in place.
      [doc.id, doc.pageCount]
    );

    const toNormalizedPoint = (clientX: number, clientY: number): Point | null => {
      const bounds = surfaceRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width === 0 || bounds.height === 0) return null;
      return {
        x: clamp01((clientX - bounds.left) / bounds.width),
        y: clamp01((clientY - bounds.top) / bounds.height),
      };
    };

    const commitChange = async (change: AnnotationChange): Promise<boolean> => {
      const generation = documentGenerationRef.current;
      const result = await onAnnotationChange(change);
      if (documentGenerationRef.current !== generation) {
        // The embedder swapped the open document while this save was in
        // flight — applying it now would attach/update/remove an annotation
        // against whatever document is now open (getAnnotations() is
        // documented as returning "all current annotations" for the open
        // document), not the document this change actually belongs to.
        return false;
      }
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setError(null);
      switch (change.op) {
        case 'delete':
          setAnnotations((prev) => prev.filter((a) => a.id !== change.id));
          break;
        case 'create':
          setAnnotations((prev) => [...prev, result.value]);
          break;
        case 'update':
          setAnnotations((prev) => prev.map((a) => (a.id === result.value.id ? result.value : a)));
          break;
      }
      return true;
    };

    const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!canAnnotatePdf || !activeTool || pendingTextBox || editingTextBoxId) return;
      if (activePointerIdRef.current !== null) return; // a gesture is already in progress
      const pt = toNormalizedPoint(e.clientX, e.clientY);
      if (!pt) return;
      activePointerIdRef.current = e.pointerId;
      setDraft(activeTool === 'ink' ? { kind: 'ink', points: [pt] } : { kind: activeTool, start: pt, current: pt });
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draft || e.pointerId !== activePointerIdRef.current) return;
      if (!canAnnotatePdf) {
        // Permission was revoked mid-drag (e.g. an embedder-pushed role
        // change) — abandon the gesture rather than let pointerup commit it.
        setDraft(null);
        activePointerIdRef.current = null;
        return;
      }
      const pt = toNormalizedPoint(e.clientX, e.clientY);
      if (!pt) return;
      setDraft(
        draft.kind === 'ink' ? { ...draft, points: [...draft.points, pt] } : { ...draft, current: pt }
      );
    };

    // A true pointer cancel (browser-initiated gesture interruption) discards
    // the in-progress draft without committing it — unlike pointerup/leave,
    // which finish the gesture normally.
    const handlePointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      setDraft(null);
      activePointerIdRef.current = null;
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draft || e.pointerId !== activePointerIdRef.current) return;
      activePointerIdRef.current = null;
      if (!canAnnotatePdf) {
        setDraft(null);
        return;
      }
      if (draft.kind === 'ink') {
        if (isStrokeSizable(draft.points)) {
          const annotation: InkAnnotation = {
            kind: 'ink',
            id: newAnnotationId(),
            page,
            strokes: [{ color: INK_COLOR, width: INK_WIDTH, points: draft.points }],
            createdAt: new Date().toISOString(),
            createdBy: user.userId,
          };
          void commitChange({ op: 'create', annotation });
        }
        setDraft(null);
        return;
      }

      if (draft.kind === 'rectangle' || draft.kind === 'arrow' || draft.kind === 'line') {
        // Sizability is checked against the raw, pre-snap points. GRID_SIZE
        // (0.02) is larger than MIN_RECT_SIZE/MIN_STROKE_LENGTH (0.01), so
        // two points from a clearly deliberate drag can round to the same
        // grid intersection — checking post-snap would let grid alignment
        // retroactively invalidate an already-valid drag and silently drop
        // the shape. Rectangle sizability reuses the highlight rule (both
        // dimensions must clear the threshold, rejecting slivers); arrow/
        // line only care about end-to-end length, so they reuse the
        // ink-stroke rule.
        const sizable =
          draft.kind === 'rectangle'
            ? isRectSizable(rectFromPoints(draft.start, draft.current))
            : isStrokeSizable([draft.start, draft.current]);
        if (sizable) {
          // Snap only now, on commit of an already-valid drag — see
          // GRID_SIZE's comment for why this happens on commit rather than
          // while dragging.
          const start = snapToGrid(draft.start, GRID_SIZE);
          const end = snapToGrid(draft.current, GRID_SIZE);
          const annotation: ShapeAnnotation = {
            kind: 'shape',
            id: newAnnotationId(),
            page,
            shapeType: draft.kind,
            start,
            end,
            createdAt: new Date().toISOString(),
            createdBy: user.userId,
          };
          void commitChange({ op: 'create', annotation });
        }
        setDraft(null);
        return;
      }

      const rect = rectFromPoints(draft.start, draft.current);
      if (!isRectSizable(rect)) {
        setDraft(null);
        return;
      }
      if (draft.kind === 'highlight') {
        const annotation: HighlightAnnotation = {
          kind: 'highlight',
          id: newAnnotationId(),
          page,
          rect,
          color: HIGHLIGHT_COLOR,
          createdAt: new Date().toISOString(),
          createdBy: user.userId,
        };
        void commitChange({ op: 'create', annotation });
      } else {
        // Text box needs its content before it can be persisted — open the
        // inline editor instead of committing an empty annotation. Captures
        // `page` now, since confirming happens later and the user may have
        // navigated to a different page while composing the text.
        setPendingTextBox({ rect, page });
        setTextDraft('');
      }
      setDraft(null);
    };

    const confirmNewTextBox = async () => {
      if (!pendingTextBox || !textDraft.trim()) {
        setPendingTextBox(null);
        return;
      }
      const annotation: TextBoxAnnotation = {
        kind: 'textBox',
        id: newAnnotationId(),
        page: pendingTextBox.page,
        position: pendingTextBox.rect,
        text: textDraft.trim(),
        color: '#000000',
        createdAt: new Date().toISOString(),
        createdBy: user.userId,
      };
      // Only dismiss the editor once the save actually succeeds — on failure
      // (network/session error) the user's typed content and drag rect stay
      // put so they don't have to redraw and retype it.
      const saved = await commitChange({ op: 'create', annotation });
      if (saved) {
        setPendingTextBox(null);
        setTextDraft('');
      }
    };

    const startEditingTextBox = (annotation: TextBoxAnnotation) => {
      // Refuse to switch to editing a different text box while one is
      // already being edited — textDraft is shared, so switching without
      // saving/cancelling first would silently discard the unsaved edit.
      if (!canAnnotatePdf || (editingTextBoxId && editingTextBoxId !== annotation.id)) return;
      setEditingTextBoxId(annotation.id);
      setTextDraft(annotation.text);
    };

    const confirmEditTextBox = async (original: TextBoxAnnotation) => {
      if (!textDraft.trim()) {
        setEditingTextBoxId(null);
        return;
      }
      const saved = await commitChange({ op: 'update', annotation: { ...original, text: textDraft.trim() } });
      if (saved) {
        setEditingTextBoxId(null);
        setTextDraft('');
      }
    };

    const deleteAnnotation = (id: string) => {
      void commitChange({ op: 'delete', id });
    };

    const runOcr = async () => {
      const requestId = ++ocrRequestIdRef.current;
      setOcrLoading(true);
      const result = await onOcrPage(page);
      // The page or document changed while this request was in flight —
      // applying it now would show OCR text for whatever the user was
      // looking at when they clicked "Run OCR", not what's on screen now.
      if (ocrRequestIdRef.current !== requestId) return;
      setOcrLoading(false);
      if (result.ok) {
        setError(null);
        setOcrResult(result.value);
      } else {
        setError(result.error);
      }
    };

    const pageAnnotations = useMemo(
      () => annotations.filter((a) => a.page === page),
      [annotations, page]
    );

    // Chromium/Firefox/Edge's built-in PDF viewer honors the #page= URL
    // fragment, which is what keeps the visible document in sync with the
    // page nav buttons and goToPage() — otherwise the iframe would stay on
    // whatever page it was last scrolled to while the annotation overlay
    // moved on without it. No equivalent exists for pptx/docx (browsers have
    // no built-in Office viewer), so those remain a known, view-only gap.
    const iframeSrc = doc.type === 'pdf' ? `${doc.fileUrl}#page=${page}` : doc.fileUrl;

    return (
      <div className="sek-document-viewer">
        {error && (
          <div className="sek-document-viewer__error" role="alert">
            {error.message}
          </div>
        )}

        <div className="sek-document-viewer__toolbar">
          <button type="button" onClick={() => setPage((p) => clampPage(p - 1, doc.pageCount))} disabled={page <= 1}>
            Previous page
          </button>
          <span className="sek-document-viewer__page-indicator">
            Page {page}
            {doc.pageCount ? ` of ${doc.pageCount}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => clampPage(p + 1, doc.pageCount))}
            disabled={!!doc.pageCount && page >= doc.pageCount}
          >
            Next page
          </button>

          {canAnnotatePdf && (
            <div className="sek-document-viewer__tools" role="group" aria-label="Annotation tools">
              {(['highlight', 'textBox', 'ink'] as const).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={activeTool === tool}
                  onClick={() => setActiveTool((t) => (t === tool ? null : tool))}
                >
                  {toolLabel(tool)}
                </button>
              ))}

              {/* SEK-05 — opt-in toggle; the 3 shape-tool buttons below only
                  render "Where diagram-ink mode is enabled" per the spec. */}
              <label className="sek-document-viewer__diagram-toggle">
                <input
                  type="checkbox"
                  checked={diagramInkMode}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setDiagramInkMode(enabled);
                    // A shape tool left active after its button disappears
                    // would have no way to be turned off again — fall back
                    // to no active tool instead.
                    if (!enabled && activeTool && SHAPE_TOOLS.has(activeTool)) {
                      setActiveTool(null);
                    }
                  }}
                />
                Diagram-ink mode
              </label>

              {diagramInkMode &&
                (['rectangle', 'arrow', 'line'] as const).map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    aria-pressed={activeTool === tool}
                    onClick={() => setActiveTool((t) => (t === tool ? null : tool))}
                  >
                    {toolLabel(tool)}
                  </button>
                ))}
            </div>
          )}

          {canOcrPdf && (
            <button type="button" onClick={() => void runOcr()} disabled={ocrLoading}>
              {ocrLoading ? 'Running OCR…' : 'Run OCR on this page'}
            </button>
          )}
        </div>

        {doc.type !== 'pdf' && KNOWN_DOCUMENT_TYPES.has(doc.type) && (
          <p className="sek-document-viewer__view-only-hint">
            {doc.type.toUpperCase()} documents are view-only — annotations and OCR are PDF-only.
          </p>
        )}

        <div
          ref={surfaceRef}
          className="sek-document-viewer__surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <iframe
            className="sek-document-viewer__frame"
            title={doc.title ?? doc.fileUrl}
            src={iframeSrc}
          />

          {doc.type === 'pdf' && (
            <svg
              className="sek-document-viewer__overlay"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* Defined once, unconditionally — harmless (and unrendered)
                  when no arrow annotation references it. Sized off GRID_SIZE
                  so the arrowhead reads as roughly one grid cell, matching
                  the "light grid" scale shapes snap to. */}
              <defs>
                <marker
                  id={ARROWHEAD_MARKER_ID}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth={GRID_SIZE}
                  markerHeight={GRID_SIZE}
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 Z" fill={SHAPE_COLOR} />
                </marker>
              </defs>
              {pageAnnotations.map((a) => {
                if (a.kind === 'highlight') {
                  return (
                    <rect
                      key={a.id}
                      x={a.rect.x}
                      y={a.rect.y}
                      width={a.rect.width}
                      height={a.rect.height}
                      fill={a.color}
                      fillOpacity={0.35}
                    />
                  );
                }
                if (a.kind === 'ink') {
                  return a.strokes.map((stroke, i) => (
                    <polyline
                      key={`${a.id}-${i}`}
                      points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      stroke={stroke.color}
                      strokeWidth={stroke.width / surfaceWidthPx}
                      fill="none"
                    />
                  ));
                }
                if (a.kind === 'shape') {
                  if (a.shapeType === 'rectangle') {
                    return (
                      <rect
                        key={a.id}
                        {...rectFromPoints(a.start, a.end)}
                        fill="none"
                        stroke={SHAPE_COLOR}
                        strokeWidth={INK_WIDTH / surfaceWidthPx}
                      />
                    );
                  }
                  return (
                    <line
                      key={a.id}
                      x1={a.start.x}
                      y1={a.start.y}
                      x2={a.end.x}
                      y2={a.end.y}
                      stroke={SHAPE_COLOR}
                      strokeWidth={INK_WIDTH / surfaceWidthPx}
                      markerEnd={a.shapeType === 'arrow' ? `url(#${ARROWHEAD_MARKER_ID})` : undefined}
                    />
                  );
                }
                return null;
              })}
              {draft?.kind === 'highlight' && (
                <rect {...rectFromPoints(draft.start, draft.current)} fill={HIGHLIGHT_COLOR} fillOpacity={0.35} />
              )}
              {draft?.kind === 'textBox' && (
                <rect
                  {...rectFromPoints(draft.start, draft.current)}
                  fill="none"
                  stroke="#000000"
                  strokeDasharray="0.01"
                />
              )}
              {draft?.kind === 'ink' && (
                <polyline
                  points={draft.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  stroke={INK_COLOR}
                  strokeWidth={INK_WIDTH / surfaceWidthPx}
                  fill="none"
                />
              )}
              {draft?.kind === 'rectangle' && (
                <rect
                  {...rectFromPoints(draft.start, draft.current)}
                  fill="none"
                  stroke={SHAPE_COLOR}
                  strokeWidth={INK_WIDTH / surfaceWidthPx}
                  strokeDasharray="0.01"
                />
              )}
              {(draft?.kind === 'arrow' || draft?.kind === 'line') && (
                <line
                  x1={draft.start.x}
                  y1={draft.start.y}
                  x2={draft.current.x}
                  y2={draft.current.y}
                  stroke={SHAPE_COLOR}
                  strokeWidth={INK_WIDTH / surfaceWidthPx}
                  strokeDasharray="0.01"
                  markerEnd={draft.kind === 'arrow' ? `url(#${ARROWHEAD_MARKER_ID})` : undefined}
                />
              )}
            </svg>
          )}
        </div>

        {pendingTextBox && (
          <div className="sek-document-viewer__text-box-editor">
            <textarea
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Text box content"
              autoFocus
            />
            <button type="button" onClick={() => void confirmNewTextBox()}>
              Add text box
            </button>
            <button type="button" onClick={() => setPendingTextBox(null)}>
              Cancel
            </button>
          </div>
        )}

        {doc.type === 'pdf' && pageAnnotations.length > 0 && (
          <ul className="sek-document-viewer__annotations">
            {pageAnnotations.map((a) => (
              <li key={a.id} data-kind={a.kind}>
                {a.kind === 'textBox' && editingTextBoxId === a.id ? (
                  <>
                    <textarea value={textDraft} onChange={(e) => setTextDraft(e.target.value)} autoFocus />
                    <button type="button" onClick={() => void confirmEditTextBox(a)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingTextBoxId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      {a.kind === 'highlight' && (a.note ? `Highlight: ${a.note}` : 'Highlight')}
                      {a.kind === 'textBox' && a.text}
                      {a.kind === 'ink' && 'Ink stroke'}
                      {a.kind === 'shape' && `${toolLabel(a.shapeType)} shape`}
                    </span>
                    {canAnnotatePdf && a.kind === 'textBox' && !editingTextBoxId && (
                      <button type="button" onClick={() => startEditingTextBox(a)}>
                        Edit
                      </button>
                    )}
                    {canAnnotatePdf && (
                      <button type="button" onClick={() => deleteAnnotation(a.id)}>
                        Delete
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {ocrResult && (
          <div className="sek-document-viewer__ocr-result">
            <p className="sek-document-viewer__ocr-hint">Best-effort OCR — review before relying on it.</p>
            <p>{ocrResult.text}</p>
          </div>
        )}
      </div>
    );
  }
);

// Exhaustive over Tool (and reused for ShapeAnnotation.shapeType, a subset
// of it) — a switch with no default so a new Tool literal fails to compile
// here instead of silently falling through to a blank button label.
function toolLabel(tool: Tool | ShapeAnnotation['shapeType']): string {
  switch (tool) {
    case 'highlight':
      return 'Highlight';
    case 'textBox':
      return 'Text box';
    case 'ink':
      return 'Ink';
    case 'rectangle':
      return 'Rectangle';
    case 'arrow':
      return 'Arrow';
    case 'line':
      return 'Line';
  }
}

function clampPage(target: number, pageCount: number | undefined): number {
  // A pageCount of 0 (or negative) is treated the same as "unknown" rather
  // than clamping the page to 0 — pages are 1-indexed, so 0 is never valid.
  const upper = pageCount && pageCount > 0 ? pageCount : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(1, target), upper);
}
