/**
 * SEK-04 — pure image-search logic.
 *
 * Framework-agnostic on purpose (no React) so it can be unit-tested directly,
 * mirroring code-editor/logic.ts and notes/linkExtraction.ts.
 */

import type { ImageInsert } from './types.js';

/**
 * Builds the Markdown block NotesEditor appends to its content on insert.
 * Uses `insert.embeddedUrl`, never a search result's `sourceUrl` — that's
 * the acceptance criterion this whole feature exists to satisfy ("embedded,
 * not just linked"). Attribution is rendered as visible text under the
 * image, not just alt text, since ImageSearchResult.attribution's own doc
 * comment requires the embedder to render it.
 */
export function buildImageMarkdown(insert: ImageInsert): string {
  return `![${insert.altText}](${insert.embeddedUrl})\n*${insert.attribution}*`;
}
