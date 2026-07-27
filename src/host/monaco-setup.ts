/**
 * SDA — Monaco bootstrap for the Coding tab's WebView host bundle.
 *
 * Not part of the public SEK interface — CodeEditor.tsx itself is agnostic
 * about where Monaco's assets come from (TWA, a real bundler consumer, may
 * make a different tradeoff there someday). This file exists only for the
 * `file://`-loaded, no-internet-guaranteed Avalonia WebView host bundle:
 *
 *   1. Points @monaco-editor/react's loader at the esbuild-bundled
 *      `monaco-editor` instance instead of its default jsdelivr CDN fetch —
 *      a CDN fetch would silently hang/fail with no internet access.
 *   2. Points Monaco's own per-language web workers at the sibling
 *      `workers/*.worker.js` files scripts/build-host.mjs bundles alongside
 *      this entry, via relative (same-origin, file://-safe) URLs — mirrors
 *      how bundle.js/sek-host.css are already loaded relative to
 *      host/code-index.html.
 *
 * Must run before the first <Editor> mounts, so code-host-entry.tsx imports
 * this module first, before importing CodeEditor.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

const WORKER_FILE_BY_LABEL: Readonly<Record<string, string>> = {
  json: 'json.worker.js',
  css: 'css.worker.js',
  scss: 'css.worker.js',
  less: 'css.worker.js',
  html: 'html.worker.js',
  handlebars: 'html.worker.js',
  razor: 'html.worker.js',
  typescript: 'ts.worker.js',
  javascript: 'ts.worker.js',
};

self.MonacoEnvironment = {
  getWorkerUrl(_moduleId: string, label: string) {
    const file = WORKER_FILE_BY_LABEL[label] ?? 'editor.worker.js';
    return `./workers/${file}`;
  },
};

loader.config({ monaco });
