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
 * loading an existing note's Markdown round-trips its links correctly.
 *
 * `renderHTML`/click handling render the link as its anchor text (not raw bracket syntax)
 * and make it navigable — but this only ever touches HTML rendering (`renderHTML`, the
 * ProseMirror plugin below) and the node's *screen* representation, never
 * `renderMarkdown`/`parseMarkdown`/the tokenizer, since those are the empirically-fragile
 * part of the markdown round-trip this file's doc comment above warns about.
 *
 * `unescapeNoteLinkBrackets` fixes (2): a post-serialize string pass undoing exactly the
 * escaping above for our two known patterns, since typed-fresh brackets never become a
 * `NoteLink` node in the first place (no InputRule converts them live) and so never go
 * through `NoteLink`'s own escape-free renderMarkdown.
 */
import { Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Mirrors linkExtraction.ts's LINK_PATTERN (kept as a separate, non-global, anchored
// copy here since this file's regex needs `.exec` semantics at a fixed offset, not
// `matchAll` — keep both in sync if the wikilink/id-link syntax ever changes). Not
// imported from linkExtraction.ts: this repo's `node --test` runtime (Node's built-in
// TypeScript type-stripping, no bundler — see tsconfig.json's `allowImportingTsExtensions`
// comment) only resolves `import type` across sibling .ts files, not value imports/calls —
// verified empirically, same "verify, don't assume" discipline as the rest of this file.
const NOTE_LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(id:([^)]+)\)/;
const NOTE_LINK_START = /\[\[|\[[^\]]*\]\(id:/;

/** Local twin of linkExtraction.ts's parseSingleLink — see the NOTE_LINK_PATTERN comment
 * above for why this can't just import that instead. */
function parseLinkRaw(raw: string): { toNoteId: string; anchor: string } | null {
  const match = NOTE_LINK_PATTERN.exec(raw);
  if (!match || match.index !== 0) return null;

  const [, wikiTarget, wikiAlias, mdAnchor, mdTarget] = match;
  const toNoteId = (wikiTarget ?? mdTarget ?? '').trim();
  if (!toNoteId) return null;

  const anchor = (wikiTarget !== undefined ? (wikiAlias ?? wikiTarget) : mdAnchor ?? '').trim();
  if (!anchor) return null;

  return { toNoteId, anchor };
}

export type NoteLinkStatus = 'pending' | 'resolved' | 'not_found';

/**
 * Mutable, per-editor-instance storage — NOT part of NOTES_EXTENSIONS' module-scope
 * config. NotesEditor.tsx writes into `editor.storage.noteLink` imperatively (via a
 * useEffect keyed on the callback/status data it actually depends on) whenever
 * `onNavigateToNote` or link-resolution status changes, rather than reconstructing the
 * extensions array — recreating that array on every render would tear down and rebuild
 * the whole ProseMirror instance, losing cursor position and undo history (see
 * NotesEditor.tsx's own comment on NOTES_EXTENSIONS for why that's avoided elsewhere).
 */
export interface NoteLinkStorage {
  onNavigate?: ((toNoteId: string) => void) | undefined;
  getStatus?: ((toNoteId: string) => NoteLinkStatus) | undefined;
}

const noteLinkDecorationsKey = new PluginKey('noteLinkDecorations');

declare module '@tiptap/core' {
  interface Storage {
    noteLink: NoteLinkStorage;
  }
}

export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addStorage(): NoteLinkStorage {
    return {};
  },

  addAttributes() {
    return { raw: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-note-link]' }];
  },

  renderHTML({ node }) {
    const raw = (node.attrs.raw as string) ?? '';
    const parsed = parseLinkRaw(raw);
    return [
      'span',
      {
        'data-note-link': 'true',
        ...(parsed ? { 'data-note-link-target': parsed.toNoteId } : {}),
        class: 'sek-notes-editor__wikilink',
      },
      parsed?.anchor ?? raw,
    ];
  },

  // Click-to-navigate + not-found styling both need data (a callback, async resolution
  // status) that lives outside the document and can change without the doc changing —
  // a ProseMirror plugin's handleClick/decorations, reading live from `this.storage`
  // (via the editor instance) on every call, fits that better than baking either into
  // renderHTML (which only runs when the node itself is (re)created).
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: noteLinkDecorationsKey,
        props: {
          handleClick: (view, pos, event) => {
            const target = (event.target as HTMLElement | null)?.closest('[data-note-link-target]');
            const toNoteId = target?.getAttribute('data-note-link-target');
            if (!toNoteId) return false;
            editor.storage.noteLink.onNavigate?.(toNoteId);
            return true;
          },
          decorations: (state) => {
            const getStatus = editor.storage.noteLink.getStatus;
            if (!getStatus) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'noteLink') return;
              const parsed = parseLinkRaw((node.attrs.raw as string) ?? '');
              if (!parsed) return;
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, {
                  'data-status': getStatus(parsed.toNoteId),
                })
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
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
