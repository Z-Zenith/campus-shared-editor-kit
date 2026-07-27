/**
 * SEK-04 — Built-in image search component.
 *
 * Implements the ImageSearchProps contract from ./types.ts. Unstyled on
 * purpose (semantic HTML + stable class hooks only) — SEK owns no styling
 * opinions, the embedder (TWA, SDA) skins it. Intended to be rendered only
 * as a child of NotesEditor (see types.ts's module doc comment) — this file
 * doesn't enforce that itself, NotesEditor's own wiring is what satisfies
 * "no separate image search screen outside the notes editor".
 */

import { useState } from 'react';
import type { SekError } from '../types/common.js';
import type { ImageSearchProps, ImageSearchResult } from './types.js';

export function ImageSearch({ enabled, onSearch, onUploadImage, onInsert }: ImageSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReadonlyArray<ImageSearchResult>>([]);
  const [degraded, setDegraded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [error, setError] = useState<SekError | null>(null);

  if (!enabled) {
    return null;
  }

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }
    setSearching(true);
    setError(null);
    const outcome = await onSearch(query.trim());
    setSearching(false);
    if (outcome.ok) {
      setResults(outcome.value.results);
      setDegraded(outcome.value.degraded);
    } else {
      setResults([]);
      setDegraded(false);
      setError(outcome.error);
    }
  };

  const handleInsert = async (result: ImageSearchResult) => {
    setInsertingId(result.id);
    setError(null);
    const outcome = await onUploadImage(result);
    setInsertingId(null);
    if (outcome.ok) {
      onInsert(outcome.value);
    } else {
      setError(outcome.error);
    }
  };

  return (
    <div className="sek-image-search">
      {error && (
        <div className="sek-image-search__error" role="alert">
          {error.message}
        </div>
      )}
      <div className="sek-image-search__query">
        <input
          className="sek-image-search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSearch();
          }}
          placeholder="Search images…"
        />
        <button type="button" onClick={() => void handleSearch()} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {degraded && (
        <div className="sek-image-search__degraded" role="status">
          Image search is temporarily unavailable — showing whatever results came back.
        </div>
      )}
      <ul className="sek-image-search__results">
        {results.map((result) => (
          <li key={result.id} className="sek-image-search__result">
            <img
              className="sek-image-search__thumbnail"
              src={result.thumbnailUrl}
              alt={result.title}
              width={result.width}
              height={result.height}
            />
            <div className="sek-image-search__attribution">{result.attribution}</div>
            <button
              type="button"
              onClick={() => void handleInsert(result)}
              disabled={insertingId !== null}
            >
              {insertingId === result.id ? 'Inserting…' : 'Insert'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
