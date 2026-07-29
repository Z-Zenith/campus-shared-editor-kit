/**
 * SEK-03 — "Ribbon-lite" formatting toolbar for the Notes rich-text editor: a small tab
 * strip (Home / Insert) over grouped button rows, styled after Word's Home ribbon without
 * going as far as a full multi-row ribbon with every tab Word has — see NotesEditor.tsx's
 * doc comment for the scope call.
 *
 * Unstyled (class hooks only, `data-active`/`data-disabled` state attributes matching
 * CodeEditor.tsx's existing `[data-active="true"]` convention) — the embedder skins it.
 * Uses `useEditorState` (not raw `editor.isActive()` reads in JSX) because `useEditor`
 * only re-renders its host component on doc-changing transactions, not pure selection
 * changes — reading `isActive` directly here would make active-button state visually lag
 * a keystroke/click behind the actual cursor position. Every new control added for the
 * ribbon-lite pass follows this same pattern.
 */
import { useState } from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';

interface NotesToolbarProps {
  readonly editor: Editor | null;
  readonly canEdit: boolean;
  /** SEK-04 — whether the "Insert image" button should be enabled. */
  readonly imageSearchEnabled?: boolean | undefined;
  /** Opens NotesEditor's ImageSearchPanel (owned there, not by this toolbar). */
  readonly onOpenImageSearch?: (() => void) | undefined;
}

interface ColorSwatch {
  readonly label: string;
  readonly hex: string;
}

// A fixed palette rather than a native <input type="color"> — consistent rendering
// across every WebView platform this app targets (WebView2/WKWebView/WPE WebKit),
// matching Word's own simplified toolbar color swatch UX rather than the OS color
// picker's inconsistent chrome.
const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { label: 'Black', hex: '#000000' },
  { label: 'Red', hex: '#c0392b' },
  { label: 'Blue', hex: '#2b579a' },
  { label: 'Green', hex: '#1e8449' },
  { label: 'Orange', hex: '#b9770e' },
  { label: 'Purple', hex: '#6c3483' },
];

const HIGHLIGHT_SWATCHES: readonly ColorSwatch[] = [
  { label: 'Yellow', hex: '#fff3a3' },
  { label: 'Green', hex: '#c8f2c8' },
  { label: 'Blue', hex: '#c8e2f2' },
  { label: 'Pink', hex: '#f7c8e0' },
];

const FONT_FAMILIES: readonly { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Sans-serif', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
];

const TEXT_ALIGNMENTS: readonly { label: string; value: 'left' | 'center' | 'right' | 'justify' }[] = [
  { label: '⟸', value: 'left' },
  { label: '↔', value: 'center' },
  { label: '⟹', value: 'right' },
  { label: '☰', value: 'justify' },
];

const DEFAULT_STATE = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  headingLevel: 0,
  fontFamily: '',
  textAlign: 'left' as 'left' | 'center' | 'right' | 'justify',
  bulletList: false,
  orderedList: false,
  taskList: false,
  table: false,
  color: null as string | null,
  highlight: null as string | null,
  canUndo: false,
  canRedo: false,
};

type Tab = 'home' | 'insert';

export function NotesToolbar({ editor, canEdit, imageSearchEnabled, onOpenImageSearch }: NotesToolbarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('home');

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            headingLevel: [1, 2, 3].find((level) => e.isActive('heading', { level })) ?? 0,
            fontFamily: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
            textAlign: (e.getAttributes('paragraph').textAlign ?? e.getAttributes('heading').textAlign ?? 'left') as
              | 'left'
              | 'center'
              | 'right'
              | 'justify',
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            taskList: e.isActive('taskList'),
            table: e.isActive('table'),
            color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
            highlight: (e.getAttributes('highlight').color as string | undefined) ?? null,
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : DEFAULT_STATE,
  });
  const s = state ?? DEFAULT_STATE;

  const disabled = !canEdit || !editor;

  const button = (
    key: string,
    label: string,
    active: boolean,
    onClick: () => void,
    extraDisabled = false
  ) => (
    <button
      key={key}
      type="button"
      className="sek-notes-editor__toolbar-button"
      data-active={active}
      disabled={disabled || extraDisabled}
      onClick={onClick}
      title={label}
    >
      {label}
    </button>
  );

  const tab = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      className="sek-notes-editor__ribbon-tab"
      data-active={activeTab === id}
      onClick={() => setActiveTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="sek-notes-editor__ribbon">
      <div className="sek-notes-editor__ribbon-tabs" role="tablist">
        {tab('home', 'Home')}
        {tab('insert', 'Insert')}
      </div>

      {activeTab === 'home' && (
        <div className="sek-notes-editor__toolbar" role="toolbar">
          <div className="sek-notes-editor__toolbar-group">
            <select
              className="sek-notes-editor__toolbar-heading-select"
              disabled={disabled}
              value={s.headingLevel}
              onChange={(e) => {
                const level = Number(e.target.value);
                if (level === 0) {
                  editor?.chain().focus().setParagraph().run();
                } else {
                  editor?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
                }
              }}
            >
              <option value={0}>Normal</option>
              <option value={1}>Heading 1</option>
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </select>
            <select
              className="sek-notes-editor__toolbar-font-select"
              disabled={disabled}
              value={s.fontFamily}
              onChange={(e) => {
                if (e.target.value) {
                  editor?.chain().focus().setFontFamily(e.target.value).run();
                } else {
                  editor?.chain().focus().unsetFontFamily().run();
                }
              }}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sek-notes-editor__toolbar-group">
            {button('bold', 'B', s.bold, () => editor?.chain().focus().toggleBold().run())}
            {button('italic', 'I', s.italic, () => editor?.chain().focus().toggleItalic().run())}
            {button('underline', 'U', s.underline, () => editor?.chain().focus().toggleUnderline().run())}
            {button('strike', 'S', s.strike, () => editor?.chain().focus().toggleStrike().run())}
          </div>

          <div className="sek-notes-editor__toolbar-group">
            {TEXT_ALIGNMENTS.map((a) =>
              button(`align-${a.value}`, a.label, s.textAlign === a.value, () =>
                editor?.chain().focus().setTextAlign(a.value).run()
              )
            )}
          </div>

          <div className="sek-notes-editor__toolbar-group">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                className="sek-notes-editor__toolbar-color-swatch"
                data-active={s.color === swatch.hex}
                disabled={disabled}
                title={`Text color: ${swatch.label}`}
                style={{ backgroundColor: swatch.hex }}
                onClick={() => editor?.chain().focus().setColor(swatch.hex).run()}
              />
            ))}
          </div>

          <div className="sek-notes-editor__toolbar-group">
            {HIGHLIGHT_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                className="sek-notes-editor__toolbar-color-swatch sek-notes-editor__toolbar-highlight-swatch"
                data-active={s.highlight === swatch.hex}
                disabled={disabled}
                title={`Highlight: ${swatch.label}`}
                style={{ backgroundColor: swatch.hex }}
                onClick={() =>
                  s.highlight === swatch.hex
                    ? editor?.chain().focus().unsetHighlight().run()
                    : editor?.chain().focus().setHighlight({ color: swatch.hex }).run()
                }
              />
            ))}
          </div>

          <div className="sek-notes-editor__toolbar-group">
            {button('bulletList', '• List', s.bulletList, () => editor?.chain().focus().toggleBulletList().run())}
            {button('orderedList', '1. List', s.orderedList, () => editor?.chain().focus().toggleOrderedList().run())}
            {button('taskList', '☑ Checklist', s.taskList, () => editor?.chain().focus().toggleTaskList().run())}
          </div>

          <div className="sek-notes-editor__toolbar-group">
            {button('undo', '↶ Undo', false, () => editor?.chain().focus().undo().run(), !s.canUndo)}
            {button('redo', '↷ Redo', false, () => editor?.chain().focus().redo().run(), !s.canRedo)}
          </div>
        </div>
      )}

      {activeTab === 'insert' && (
        <div className="sek-notes-editor__toolbar" role="toolbar">
          <div className="sek-notes-editor__toolbar-group">
            {button('table', '⊞ Table', s.table, () =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            )}
            {button(
              'image',
              '🖼 Image',
              false,
              () => onOpenImageSearch?.(),
              !imageSearchEnabled || !onOpenImageSearch
            )}
          </div>
        </div>
      )}
    </div>
  );
}
