/**
 * SEK-04 — Built-in image search (inside the notes editor) public interface.
 *
 * Spec: docs/Campus platform architecture.md, Section 3 (SEK-04).
 *   "Where in-app image search is available, the notes editor component of the
 *    Shared Editor Kit shall let a user search the web and insert images
 *    directly into a note."
 *
 * Acceptance criteria this interface MUST enforce:
 *   - "Inserted image is embedded in the note, not just linked" — the embed
 *     payload is a Markdown image with a stable, content-addressed URL
 *     (returned by the embedder's onUploadImage), NOT the original search URL.
 *   - "No separate 'image search' screen exists outside the notes editor" —
 *     this module is intended to be rendered only as a child of NotesEditor.
 *
 * Priority is "Could" — the embedder may render a disabled/empty state when
 * the feature is not enabled in their build.
 */

import type { Result, SekError, UserContext } from '../types/common.js';

/** One image returned by the search backend. */
export interface ImageSearchResult {
  /** Stable ID for the result row. */
  readonly id: string;
  /** Source page title for the result. */
  readonly title: string;
  /**
   * Original URL of the image as found on the web. NOT meant to be embedded
   * in the note directly — see ImageInsert for that.
   */
  readonly sourceUrl: string;
  /** Thumbnail URL for preview. */
  readonly thumbnailUrl: string;
  /** Image intrinsic dimensions, for layout. */
  readonly width: number;
  readonly height: number;
  /** Attribution text (license + author) — embedder must render this. */
  readonly attribution: string;
}

export interface ImageSearchResponse {
  readonly query: string;
  readonly results: ReadonlyArray<ImageSearchResult>;
  /** True when the search service is unavailable and the UI should degrade. */
  readonly degraded: boolean;
}

/** Insert payload the embedder actually writes into the note's Markdown. */
export interface ImageInsert {
  /**
   * Stable, content-addressed URL the embedder should write into the note as
   * `![alt](url)`. Returned by the embedder's onUploadImage — guarantees the
   * image survives the original source going away, which is what
   * "embedded, not linked" means.
   */
  readonly embeddedUrl: string;
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly attribution: string;
}

export interface ImageSearchProps {
  readonly user: UserContext;
  /** Whether the feature is enabled in the current build. */
  readonly enabled: boolean;
  /** Search the web for images. The embedder forwards to AI Services / external. */
  readonly onSearch: (query: string) => Promise<Result<ImageSearchResponse, SekError>>;
  /**
   * Take a search result and upload it to the embedder's storage, returning a
   * stable URL. This is the step that satisfies "embedded, not linked" — the
   * embedder never writes the original sourceUrl into the note.
   */
  readonly onUploadImage: (result: ImageSearchResult) => Promise<Result<ImageInsert, SekError>>;
  /**
   * Called once onUploadImage resolves successfully, handing the embed
   * payload to whatever owns the note's Markdown (NotesEditor, when rendered
   * as its child — see the module doc comment above). Kept separate from
   * onUploadImage so a component can be exercised/tested without needing a
   * real note to insert into.
   */
  readonly onInsert: (insert: ImageInsert) => void;
}
