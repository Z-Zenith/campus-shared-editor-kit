/**
 * SEK-03 — pure Markdown link-extraction logic.
 *
 * Framework-agnostic on purpose (no React) so it can be unit-tested directly
 * and reused outside NotesEditor if another embedder ever needs it.
 *
 * Supported syntaxes, per the NoteLinkRef doc comment in ./types.ts:
 *   - Obsidian-style wikilink: [[toNoteId]] or [[toNoteId|Custom anchor]]
 *   - Markdown id-link:        [Anchor text](id:toNoteId)
 */

import type { OutgoingLinks } from './types.js';

// Negated-class quantifiers are bounded (rather than unbounded `+`) to keep
// worst-case cost linear in input length — CodeQL js/polynomial-redos flags
// the unbounded form because an unanchored global match retries the pattern
// at every offset, so an unbounded scan-to-`]`/`)`  on adversarial input
// (e.g. a note body with many stray `[`/`(` and no closing delimiter) costs
// O(n^2). Targets/anchors are short user-typed strings in practice, so 2000
// chars is generous headroom, not a real-world truncation.
const LINK_PATTERN =
  /\[\[([^\]|]{1,2000})(?:\|([^\]]{1,2000}))?\]\]|\[([^\]]{1,2000})\]\(id:([^)]{1,2000})\)/g;

/**
 * Extracts every outgoing link from a note's raw Markdown body, in source
 * order. Malformed or empty link targets are skipped rather than throwing —
 * this feeds NotesEditor's link resolution, which must never crash on bad
 * input (see the "links resolve to not-found, not a crash" criterion).
 */
export function extractOutgoingLinks(markdown: string): OutgoingLinks {
  const links: Array<{ toNoteId: string; anchor: string }> = [];

  for (const match of markdown.matchAll(LINK_PATTERN)) {
    const [, wikiTarget, wikiAlias, mdAnchor, mdTarget] = match;

    const toNoteId = (wikiTarget ?? mdTarget ?? '').trim();
    if (!toNoteId) continue;

    const anchor = (wikiTarget !== undefined ? (wikiAlias ?? wikiTarget) : mdAnchor ?? '').trim();
    if (!anchor) continue;

    links.push({ toNoteId, anchor });
  }

  return links;
}

/**
 * #161 — a stable string key for a set of outgoing links' unique targets, independent
 * of array/object identity. `extractOutgoingLinks` returns a new array reference on
 * every call (e.g. once per keystroke in NotesEditor), which would otherwise cause a
 * `useEffect` keyed on `[outgoingLinks]` to re-run — and re-resolve every link target
 * over the network/IPC — on every keystroke even when the actual set of targets hasn't
 * changed. Depending on this key instead lets that effect skip redundant re-runs.
 */
export function uniqueLinkTargetsKey(links: OutgoingLinks): string {
  return [...new Set(links.map((link) => link.toNoteId))].sort().join(',');
}
