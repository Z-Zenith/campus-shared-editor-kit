/**
 * SEK-03 — Markdown notes (Obsidian-style linked notes) public interface.
 *
 * Spec: docs/Campus platform architecture.md, Section 3 (SEK-03).
 *   "Create/edit/delete linked Markdown notes, Obsidian-style (moved from SDA-07)."
 *
 * Acceptance criteria this interface MUST enforce:
 *   - "Deleting a note removes it; links to it resolve to a not-found state,
 *      not a crash" — the link resolution API returns Result<Note, SekError>
 *      with code 'note_not_found' instead of throwing.
 *
 * Storage: rows in the `notes` table + edges in `note_links` (see
 * docs/campus-platform-db-api-schema.md Section 1.9). SEK does not own
 * persistence — the embedder supplies the callbacks.
 */

import type { Result, SekError, UserContext } from '../types/common.js';
import type { ImageSearchProps } from '../image-search/types.js';

/** A persisted note. Content is raw Markdown, not rendered HTML. */
export interface Note {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  /** Raw Markdown source. The renderer is the embedder's responsibility. */
  readonly contentMarkdown: string;
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

/** Directed link between two notes, as extracted from the Markdown. */
export interface NoteLink {
  readonly id: string;
  readonly fromNoteId: string;
  readonly toNoteId: string;
  /** Anchor text in the source note (e.g. the displayed link text). */
  readonly anchor: string;
  readonly createdAt: string;
}

/** Link target as the user sees it — a [[wikilink]] or a markdown [text](id:...). */
export interface NoteLinkRef {
  /** The note ID the link points to. May reference a deleted note. */
  readonly toNoteId: string;
  readonly anchor: string;
}

/** Outgoing links extracted from a single note's Markdown body. */
export type OutgoingLinks = ReadonlyArray<NoteLinkRef>;

/** Result of a backlink query — who links TO this note. */
export type Backlinks = ReadonlyArray<Note>;

export interface NotesEditorProps {
  readonly user: UserContext;
  /** The note currently being edited. Null when the embedder wants a "new note" view. */
  readonly currentNote: Note | null;
  /** Whether the user can create / edit / delete notes. */
  readonly canEdit: boolean;
  /** Persist a new or updated note. */
  readonly onSave: (note: Note) => Promise<Result<Note, SekError>>;
  /** Delete a note. The embedder must also clean up `note_links` rows referencing it. */
  readonly onDelete: (noteId: string) => Promise<Result<void, SekError>>;
  /**
   * Resolve a wikilink target. Must NOT throw when the target is missing —
   * return { ok: false, error: { code: 'note_not_found', ... } } instead.
   * This is the contract that backs the "links resolve to not-found, not a crash"
   * acceptance criterion.
   */
  readonly onResolveLink: (toNoteId: string) => Promise<Result<Note, SekError>>;
  /** Query backlinks (notes that link TO a given note). */
  readonly onListBacklinks: (toNoteId: string) => Promise<Result<Backlinks, SekError>>;
  /**
   * SEK-04 — built-in image search, rendered from the toolbar's "Insert image" button.
   * Omit (or set `enabled: false`) to render that button disabled, per SEK-04's "Could"
   * priority — the embedder may ship without it. `user` is intentionally omitted here
   * versus the standalone ImageSearchProps shape: NotesEditor already has it from its own
   * top-level `user` prop and passes it through, so the embedder doesn't duplicate it.
   */
  readonly imageSearch?: Omit<ImageSearchProps, 'user'>;
  /**
   * Called when the user clicks a resolved [[wikilink]]/[text](id:...) in the editor.
   * Optional — omitting it leaves links styled but inert (no navigation), which is a valid
   * embedder choice, not a degraded state. Not called for links that resolve to
   * 'not_found' (there's nothing to navigate to).
   */
  readonly onNavigateToNote?: (noteId: string) => void;
  /** Optional theme override. Defaults to the embedder's design system. */
  readonly theme?: 'light' | 'dark' | 'system';
}

export interface NotesEditorApi {
  /** Reload the current note (e.g. after an external edit). */
  reload(): Promise<void>;
  /** Get the current Markdown body — used for autosave diffing. */
  getMarkdown(): string;
  /** Read the parsed outgoing links for the current note. */
  getOutgoingLinks(): OutgoingLinks;
}
