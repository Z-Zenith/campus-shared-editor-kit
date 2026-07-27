/**
 * SEK-03 — Tiptap glue that keeps the WYSIWYG rich-text editor's Markdown round-trip
 * compatible with linkExtraction.ts's raw-text regex.
 *
 * Two problems, verified empirically (not from docs alone) before writing this:
 *
 * 1. `[Anchor text](id:toNoteId)` is valid CommonMark link syntax. Loaded through
 *    @tiptap/markdown's default parsing, it gets consumed as a link and its href is
 *    silently dropped on re-serialization — the note loses the id entirely, not just
 *    the brackets.
 * 2. `@tiptap/markdown` unconditionally backslash-escapes `[`/`]` in any plain "text"
 *    node on serialize (`escapeMarkdownSyntax`, no config hook to disable it), so a
 *    freshly-typed `[[foo]]` — which stays a plain text node in the doc until saved,
 *    since typing doesn't run it through the markdown tokenizer — comes back out as
 *    `\[\[foo\]\]`, which linkExtraction.ts's regex no longer matches.
 *
 * `NoteLink` fixes (1): a custom Tiptap node with a `markdownTokenizer` that recognizes
 * both wikilink/id-link patterns *before* the default tokenizer/link handling sees them,
 * stores the raw matched text verbatim, and echoes it back unchanged on serialize — so
 * loading an existing note's Markdown round-trips its links correctly. It does not need
 * to render as a clickable/styled element this pass (out of scope) — an inert atom that
 * displays its own source text is enough.
 *
 * `unescapeNoteLinkBrackets` fixes (2): a post-serialize string pass undoing exactly the
 * escaping above for our two known patterns, since typed-fresh brackets never become a
 * `NoteLink` node in the first place (no InputRule converts them live) and so never go
 * through `NoteLink`'s own escape-free renderMarkdown.
 */
import { Node } from '@tiptap/core';

// Mirrors linkExtraction.ts's LINK_PATTERN (kept as a separate, non-global, anchored
// copy here since this file's regex needs `.exec` semantics at a fixed offset, not
// `matchAll` — keep both in sync if the wikilink/id-link syntax ever changes).
const NOTE_LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(id:([^)]+)\)/;
const NOTE_LINK_START = /\[\[|\[[^\]]*\]\(id:/;

export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return { raw: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-note-link]' }];
  },

  renderHTML({ node }) {
    return ['span', { 'data-note-link': 'true' }, node.attrs.raw];
  },

  markdownTokenizer: {
    name: 'noteLink',
    level: 'inline',
    start(src: string) {
      const match = src.match(NOTE_LINK_START);
      // Infinity (not -1/undefined) signals "no match" here: this tokenizer's own start
      // index is compared against every other registered tokenizer's, and the lowest
      // wins — Infinity guarantees this one is never mistaken for an earliest match.
      return match?.index ?? Infinity;
    },
    tokenize(src: string) {
      const match = NOTE_LINK_PATTERN.exec(src);
      if (!match || match.index !== 0) return undefined;
      return { type: 'noteLink', raw: match[0] };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('noteLink', { raw: token.raw ?? '' });
  },

  renderMarkdown(node) {
    return (node.attrs?.raw as string | undefined) ?? '';
  },
});

/** See this file's doc comment, point (2). */
export function unescapeNoteLinkBrackets(markdown: string): string {
  return markdown
    .replace(/\\\[\\\[([^\]]*?)\\\]\\\]/g, '[[$1]]')
    .replace(/\\\[([^\]]+)\\\]\(id:([^)]+)\)/g, '[$1](id:$2)');
}
