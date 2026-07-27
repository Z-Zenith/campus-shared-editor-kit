/**
 * SEK-01 — Code editor public surface.
 */
export type {
  Language,
  CodeFile,
  CodeProject,
  CodeRunResult,
  CodeEditorProps,
  CodeEditorApi,
} from './types.js';

export { LANGUAGE_LABELS } from './types.js';
export { CodeEditor } from './CodeEditor.js';
export {
  isSupportedLanguage,
  unsupportedLanguageError,
  inferLanguageFromExtension,
  validateProject,
  buildStarterProject,
} from './logic.js';
