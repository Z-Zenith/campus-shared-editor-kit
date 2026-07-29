/**
 * SEK-03 — Markdown notes editor component.
 *
 * Implements the NotesEditorProps/NotesEditorApi contract from ./types.ts.
 * Unstyled on purpose (semantic HTML + stable class hooks only) — SEK owns
 * no styling opinions, the embedder (TWA, SDA) skins it.
 *
 * WYSIWYG rich-text editing via Tiptap (the same engine class as VS Code's Monaco is to
 * the Coding editor — chosen for `editor.chain()...run()` / `editor.isActive(...)`
 * being purpose-built for a fully custom, unstyled toolbar, and for shipping no default
 * CSS of its own). Markdown stays the on-disk/on-wire format — `content`/`contentRef`/
 * `getMarkdown()`/`onSave`'s `Note.contentMarkdown` are unchanged from the previous
 * plain-textarea version; only where `content` comes from and what renders it changed.
 * See ./tiptapNoteLink.ts for why a custom node is needed to keep `[[wikilinks]]` and
 * `[text](id:target)` links round-tripping correctly through Tiptap's Markdown
 * serializer (verified empirically, not assumed from docs).
 *
 * "Ribbon-lite" scope (toolbar tabs, font/paragraph/insert controls, restored SEK-04
 * image search, clickable wikilinks): a deliberately achievable slice of "MS Office-like,"
 * not a full Office clone — no real-time co-authoring, comments, or track-changes. See
 * NotesToolbar.tsx for the toolbar half of this.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { SekError } from '../types/common.js';
import type {
  Backlinks,
  Note,
  NotesEditorApi,
  NotesEditorProps,
  OutgoingLinks,
} from './types.js';
import { extractOutgoingLinks, uniqueLinkTargetsKey } from './linkExtraction.js';
import { NoteLink, unescapeNoteLinkBrackets } from './tiptapNoteLink.js';
import { NotesToolbar } from './NotesToolbar.js';
import { ImageSearchPanel } from '../image-search/ImageSearchPanel.js';
import type { ImageInsert } from '../image-search/types.js';

type LinkStatus = 'pending' | 'resolved' | 'not_found';

// Module-scope and never recreated: a fresh array literal passed to useEditor on every
// render would tear down and reconstruct the underlying ProseMirror instance each time,
// losing cursor position and undo history. NoteLink's storage (callback/status data that
// DOES change over time — see tiptapNoteLink.ts's NoteLinkStorage doc comment) is kept out
// of this array on purpose and synced imperatively instead, in the effect below.
const NOTES_EXTENSIONS = [
  StarterKit.configure({ link: false }),
  Markdown,
  TaskList,
  TaskItem.configure({ nested: false }),
  TextStyle,
  Color,
  Underline,
  FontFamily,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  NoteLink,
];

function newNoteId(): string {
  // crypto.randomUUID is available in every embedder runtime we target
  // (browsers, Node 19+, and Avalonia's WebView2/CEF host).
  return globalThis.crypto.randomUUID();
}

export const NotesEditor = forwardRef<NotesEditorApi, NotesEditorProps>(
  function NotesEditor(
    { user, currentNote, canEdit, onSave, onDelete, onResolveLink, onListBacklinks, imageSearch, onNavigateToNote, theme },
    ref
  ) {
    const [title, setTitle] = useState(currentNote?.title ?? '');
    const [content, setContent] = useState(currentNote?.contentMarkdown ?? '');
    const [backlinks, setBacklinks] = useState<Backlinks>([]);
    const [linkStatuses, setLinkStatuses] = useState<Record<string, LinkStatus>>({});
    const [error, setError] = useState<SekError | null>(null);
    const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);

    // Imperative-handle methods close over stale state without this — keep a
    // ref mirroring the latest draft so getMarkdown()/getOutgoingLinks() are
    // always current even though the handle object identity is stable.
    const contentRef = useRef(content);
    contentRef.current = content;

    const editor = useEditor({
      extensions: NOTES_EXTENSIONS,
      content: currentNote?.contentMarkdown ?? '',
      contentType: 'markdown',
      editable: canEdit,
      onUpdate: ({ editor: e }) => setContent(unescapeNoteLinkBrackets(e.getMarkdown())),
    });

    useEffect(() => {
      editor?.setEditable(canEdit);
    }, [editor, canEdit]);

    const outgoingLinks: OutgoingLinks = useMemo(
      () => extractOutgoingLinks(content),
      [content]
    );

    // #161 — extractOutgoingLinks(content) produces a new array reference on every
    // keystroke even when the set of link targets hasn't actually changed, and the
    // resolution effect below depends on outgoingLinks by reference. Deriving a stable
    // key from the unique target ids lets that effect skip re-running (and re-hitting
    // onResolveLink for every link) on keystrokes that don't add/remove a link target.
    const linkTargetsKey = useMemo(() => uniqueLinkTargetsKey(outgoingLinks), [outgoingLinks]);

    const loadNote = async (noteId: string | null) => {
      setError(null);
      if (noteId === null) {
        setTitle('');
        setContent('');
        editor?.commands.setContent('', { contentType: 'markdown' });
        setBacklinks([]);
        return;
      }
      const [resolved, backlinkResult] = await Promise.all([
        onResolveLink(noteId),
        onListBacklinks(noteId),
      ]);
      if (resolved.ok) {
        setTitle(resolved.value.title);
        setContent(resolved.value.contentMarkdown);
        editor?.commands.setContent(resolved.value.contentMarkdown, { contentType: 'markdown' });
      } else {
        setError(resolved.error);
      }
      setBacklinks(backlinkResult.ok ? backlinkResult.value : []);
    };

    // Reset the draft whenever the embedder swaps which note is being edited. Updates
    // both the editor instance (imperatively) and the mirrored `content` state in the
    // same effect, rather than relying on onUpdate's callback loop to sync state back.
    useEffect(() => {
      setTitle(currentNote?.title ?? '');
      setContent(currentNote?.contentMarkdown ?? '');
      editor?.commands.setContent(currentNote?.contentMarkdown ?? '', { contentType: 'markdown' });
      setBacklinks([]);
      if (currentNote) {
        onListBacklinks(currentNote.id).then((result) => {
          if (result.ok) setBacklinks(result.value);
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentNote?.id]);

    // Resolve every outgoing link's live status so broken links render as
    // "not found" instead of crashing — this is the acceptance criterion
    // SEK-03 exists to satisfy. `cancelled` discards results from a
    // resolution pass that's since been superseded by newer edits.
    useEffect(() => {
      let cancelled = false;
      const uniqueTargets = [...new Set(outgoingLinks.map((link) => link.toNoteId))];

      setLinkStatuses((prev) => {
        const next: Record<string, LinkStatus> = {};
        for (const id of uniqueTargets) next[id] = prev[id] ?? 'pending';
        return next;
      });

      Promise.all(
        uniqueTargets.map(async (toNoteId) => {
          const result = await onResolveLink(toNoteId);
          return [toNoteId, result.ok ? 'resolved' : 'not_found'] as const;
        })
      ).then((results) => {
        if (cancelled) return;
        setLinkStatuses((prev) => ({ ...prev, ...Object.fromEntries(results) }));
      });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkTargetsKey]);

    // Keeps NoteLink's ProseMirror-plugin storage (tiptapNoteLink.ts's NoteLinkStorage)
    // in sync with the latest callback/status data, without reconstructing
    // NOTES_EXTENSIONS (which would tear down the editor — see that array's own comment).
    // Dispatching a no-op transaction after updating storage forces ProseMirror to
    // recompute the plugin's decorations, so a link's data-status attribute (and thus its
    // "not found" styling) updates live as resolution results come in, not just on the
    // next doc-changing edit.
    useEffect(() => {
      if (!editor) return;
      editor.storage.noteLink.onNavigate = onNavigateToNote;
      editor.storage.noteLink.getStatus = (toNoteId: string) => linkStatuses[toNoteId] ?? 'pending';
      editor.view.dispatch(editor.state.tr);
    }, [editor, onNavigateToNote, linkStatuses]);

    useImperativeHandle(
      ref,
      (): NotesEditorApi => ({
        reload: () => loadNote(currentNote?.id ?? null),
        getMarkdown: () => contentRef.current,
        getOutgoingLinks: () => extractOutgoingLinks(contentRef.current),
      }),
      [currentNote?.id]
    );

    const handleSave = async () => {
      if (!canEdit) return;
      const now = new Date().toISOString();
      const note: Note = {
        id: currentNote?.id ?? newNoteId(),
        ownerId: currentNote?.ownerId ?? user.userId,
        title,
        contentMarkdown: content,
        createdAt: currentNote?.createdAt ?? now,
        updatedAt: now,
      };
      const result = await onSave(note);
      if (!result.ok) setError(result.error);
    };

    const handleDelete = async () => {
      if (!canEdit || !currentNote) return;
      const result = await onDelete(currentNote.id);
      if (!result.ok) setError(result.error);
    };

    const handleImageInsert = (insert: ImageInsert) => {
      editor?.chain().focus().setImage({ src: insert.embeddedUrl, alt: insert.altText }).run();
    };

    // Resolve 'system' against the OS/embedder color scheme, live — mirrors
    // CodeEditor.tsx's identical block, so both editor tabs in the same shell
    // flip together if the OS theme changes mid-session.
    const [systemPrefersDark, setSystemPrefersDark] = useState(
      () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );
    useEffect(() => {
      const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
      if (!mql) return;
      const listener = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    }, []);
    const resolvedTheme = theme === 'system' || !theme ? (systemPrefersDark ? 'dark' : 'light') : theme;

    return (
      <div className="sek-notes-editor" data-theme={resolvedTheme}>
        {error && (
          <div className="sek-notes-editor__error" role="alert">
            {error.message}
          </div>
        )}
        <input
          className="sek-notes-editor__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled note"
          disabled={!canEdit}
        />
        <NotesToolbar
          editor={editor}
          canEdit={canEdit}
          imageSearchEnabled={imageSearch?.enabled}
          onOpenImageSearch={() => setIsImageSearchOpen(true)}
        />
        <div className="sek-notes-editor__body">
          <EditorContent editor={editor} className="sek-notes-editor__content" />
          {imageSearch && (
            <ImageSearchPanel
              {...imageSearch}
              user={user}
              open={isImageSearchOpen}
              onClose={() => setIsImageSearchOpen(false)}
              onInsert={handleImageInsert}
            />
          )}
          <aside className="sek-notes-editor__links-pane">
            <section>
              <h3>Links from this note</h3>
              <ul className="sek-notes-editor__outgoing-links">
                {outgoingLinks.length === 0 && <li className="sek-notes-editor__links-empty">No links yet.</li>}
                {outgoingLinks.map((link, i) => {
                  const status = linkStatuses[link.toNoteId] ?? 'pending';
                  return (
                    <li
                      key={`${link.toNoteId}-${i}`}
                      data-status={status}
                      onClick={() => status === 'resolved' && onNavigateToNote?.(link.toNoteId)}
                    >
                      {link.anchor}
                    </li>
                  );
                })}
              </ul>
            </section>
            <section>
              <h3>Linked from elsewhere</h3>
              <ul className="sek-notes-editor__backlinks">
                {backlinks.length === 0 && <li className="sek-notes-editor__links-empty">No backlinks yet.</li>}
                {backlinks.map((note) => (
                  <li key={note.id} onClick={() => onNavigateToNote?.(note.id)}>
                    {note.title}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
        {canEdit && (
          <div className="sek-notes-editor__actions">
            <button type="button" onClick={handleSave}>
              Save
            </button>
            {currentNote && (
              <button type="button" onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);
