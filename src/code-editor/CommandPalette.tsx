/**
 * SEK-01 — minimal VS Code-style command palette (Ctrl+Shift+P).
 *
 * Two kinds of entries: fixed actions (Run, Save) and one "go to file" entry per
 * project file, filtered together by the same fuzzy query — matches VS Code's own
 * palette, which mixes commands and quick-open results in one filterable list.
 * Unstyled (BEM class hooks only) per SEK's styling convention — the embedder skins it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyMatchFiles } from './logic.js';

interface CommandPaletteProps {
  readonly filePaths: readonly string[];
  readonly canRun: boolean;
  readonly canSave: boolean;
  readonly onSelectFile: (path: string) => void;
  readonly onRun: () => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
}

interface Entry {
  readonly kind: 'action' | 'file';
  readonly id: string;
  readonly label: string;
}

export function CommandPalette({ filePaths, canRun, canSave, onSelectFile, onRun, onSave, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const trimmed = query.trim().toLowerCase();
    const actions: Entry[] = [
      ...(canRun && 'run'.includes(trimmed) ? [{ kind: 'action' as const, id: 'run', label: '▶ Run' }] : []),
      ...(canSave && 'save'.includes(trimmed) ? [{ kind: 'action' as const, id: 'save', label: '💾 Save' }] : []),
    ];
    const files: Entry[] = fuzzyMatchFiles(filePaths, query).map((path) => ({
      kind: 'file' as const,
      id: path,
      label: path,
    }));
    return [...actions, ...files];
  }, [query, filePaths, canRun, canSave]);

  // Query changes invalidate the previous selection index — always reset to the top
  // match rather than leaving selection pointed at a now-different entry.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const commit = (entry: Entry | undefined) => {
    if (!entry) return;
    if (entry.kind === 'action') {
      if (entry.id === 'run') onRun();
      if (entry.id === 'save') onSave();
    } else {
      onSelectFile(entry.id);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(entries[selectedIndex]);
    }
  };

  return (
    <div className="sek-code-editor__command-palette-overlay" onClick={onClose}>
      <div
        className="sek-code-editor__command-palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="sek-code-editor__command-palette-input"
          placeholder="Type a command or file name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ul className="sek-code-editor__command-palette-list" role="listbox">
          {entries.length === 0 && <li className="sek-code-editor__command-palette-empty">No matches</li>}
          {entries.map((entry, index) => (
            <li
              key={`${entry.kind}-${entry.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              className="sek-code-editor__command-palette-item"
              data-selected={index === selectedIndex}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => commit(entry)}
            >
              {entry.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
