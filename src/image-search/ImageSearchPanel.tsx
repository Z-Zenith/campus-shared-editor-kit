/**
 * SEK-04 — Built-in image search panel, rendered inside NotesEditor (never as a standalone
 * screen — see types.ts's doc comment on ImageSearchProps for the acceptance criterion this
 * satisfies). A popover, not a blocking modal, so the editor keeps focus/undo-stack context
 * while the user is browsing results — closer to Word's Insert > Pictures > Online Pictures
 * flyout than a dialog.
 *
 * Unstyled on purpose, same convention as NotesToolbar — class hooks only, embedder skins it.
 */
import { useState } from 'react';
import type { ImageInsert, ImageSearchProps, ImageSearchResult } from './types.js';

export interface ImageSearchPanelProps extends ImageSearchProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called after a result has been uploaded/embedded successfully. */
  readonly onInsert: (insert: ImageInsert) => void;
}

type PanelState =
  | { readonly phase: 'idle'; readonly results: ReadonlyArray<ImageSearchResult>; readonly degraded: boolean }
  | { readonly phase: 'searching'; readonly results: ReadonlyArray<ImageSearchResult>; readonly degraded: boolean }
  | { readonly phase: 'inserting'; readonly results: ReadonlyArray<ImageSearchResult>; readonly degraded: boolean; readonly resultId: string }
  | { readonly phase: 'error'; readonly results: ReadonlyArray<ImageSearchResult>; readonly degraded: boolean; readonly message: string };

const INITIAL_STATE: PanelState = { phase: 'idle', results: [], degraded: false };

export function ImageSearchPanel({ open, enabled, onSearch, onUploadImage, onClose, onInsert }: ImageSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<PanelState>(INITIAL_STATE);
  const [hasSearched, setHasSearched] = useState(false);

  if (!open || !enabled) {
    return null;
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      return;
    }
    setState({ phase: 'searching', results: state.results, degraded: state.degraded });
    setHasSearched(true);
    const result = await onSearch(query.trim());
    if (!result.ok) {
      setState({ phase: 'error', results: state.results, degraded: state.degraded, message: result.error.message });
      return;
    }
    setState({ phase: 'idle', results: result.value.results, degraded: result.value.degraded });
  };

  const handlePick = async (result: ImageSearchResult) => {
    setState({ phase: 'inserting', results: state.results, degraded: state.degraded, resultId: result.id });
    const uploaded = await onUploadImage(result);
    if (!uploaded.ok) {
      setState({ phase: 'error', results: state.results, degraded: state.degraded, message: uploaded.error.message });
      return;
    }
    onInsert(uploaded.value);
    setQuery('');
    setState(INITIAL_STATE);
    onClose();
  };

  return (
    <div className="sek-notes-editor__image-search" role="dialog" aria-label="Insert image">
      <div className="sek-notes-editor__image-search-header">
        <span>Insert image</span>
        <button type="button" className="sek-notes-editor__image-search-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <form className="sek-notes-editor__image-search-form" onSubmit={handleSearch}>
        <input
          className="sek-notes-editor__image-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the web for images…"
          autoFocus
        />
        <button type="submit" disabled={state.phase === 'searching' || !query.trim()}>
          Search
        </button>
      </form>

      {state.phase === 'searching' && <p className="sek-notes-editor__image-search-status">Searching…</p>}
      {state.phase === 'error' && (
        <p className="sek-notes-editor__image-search-status" role="alert">
          {state.message}
        </p>
      )}
      {state.degraded && (
        <p className="sek-notes-editor__image-search-status">Image search is running in a degraded mode — results may be limited.</p>
      )}
      {state.phase === 'idle' && hasSearched && state.results.length === 0 && (
        <p className="sek-notes-editor__image-search-status">No results.</p>
      )}
      {state.results.length > 0 && (
        <ul className="sek-notes-editor__image-search-results">
          {state.results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className="sek-notes-editor__image-search-result"
                onClick={() => handlePick(result)}
                disabled={state.phase === 'inserting'}
                title={`${result.title} — ${result.attribution}`}
              >
                <img src={result.thumbnailUrl} alt={result.title} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
