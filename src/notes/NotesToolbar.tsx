/**
 * SEK-03 — Word-like formatting toolbar for the Notes rich-text editor.
 *
 * Unstyled (class hooks only, `data-active`/`data-disabled` state attributes matching
 * CodeEditor.tsx's existing `[data-active="true"]` convention) — the embedder skins it.
 * Uses `useEditorState` (not raw `editor.isActive()` reads in JSX) because `useEditor`
 * only re-renders its host component on doc-changing transactions, not pure selection
 * changes — reading `isActive` directly here would make active-button state visually lag
 * a keystroke/click behind the actual cursor position.
 */
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';

interface NotesToolbarProps {
  readonly editor: Editor | null;
  readonly canEdit: boolean;
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

const DEFAULT_STATE = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  headingLevel: 0,
  bulletList: false,
  orderedList: false,
  taskList: false,
  color: null as string | null,
  canUndo: false,
  canRedo: false,
};

export function NotesToolbar({ editor, canEdit }: NotesToolbarProps) {
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
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            taskList: e.isActive('taskList'),
            color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
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

  return (
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
      </div>

      <div className="sek-notes-editor__toolbar-group">
        {button('bold', 'B', s.bold, () => editor?.chain().focus().toggleBold().run())}
        {button('italic', 'I', s.italic, () => editor?.chain().focus().toggleItalic().run())}
        {button('underline', 'U', s.underline, () => editor?.chain().focus().toggleUnderline().run())}
        {button('strike', 'S', s.strike, () => editor?.chain().focus().toggleStrike().run())}
      </div>

      <div className="sek-notes-editor__toolbar-group">
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className="sek-notes-editor__toolbar-color-swatch"
            data-active={s.color === swatch.hex}
            disabled={disabled}
            title={swatch.label}
            style={{ backgroundColor: swatch.hex }}
            onClick={() => editor?.chain().focus().setColor(swatch.hex).run()}
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
  );
}
