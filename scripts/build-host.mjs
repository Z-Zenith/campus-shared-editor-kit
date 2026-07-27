// SDA-19/SEK-01: bundles the SEK host entries (notes editor, code editor) into standalone
// scripts an Avalonia NativeWebView can load with no bundler/node_modules of its own. A
// plain Node script (not npm-script shell chaining) so it runs identically on Windows and
// POSIX shells.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/host', { recursive: true });
mkdirSync('dist/host-code', { recursive: true });
mkdirSync('dist/host-code/workers', { recursive: true });

await build({
  entryPoints: ['src/host/notes-host-entry.tsx'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/host/bundle.js',
});
cpSync('host/index.html', 'dist/host/index.html');
cpSync('host/sek-host.css', 'dist/host/sek-host.css');

await build({
  entryPoints: ['src/host/code-host-entry.tsx'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/host-code/bundle.js',
  loader: { '.ttf': 'file' }, // Monaco's codicon font, pulled in via monaco-editor's own CSS
});
cpSync('host/code-index.html', 'dist/host-code/index.html');
cpSync('host/sek-host.css', 'dist/host-code/sek-host.css');
cpSync('host/code-host-theme.css', 'dist/host-code/code-host-theme.css');

// Monaco's per-language web workers ship as separate classic-script entry points (not part
// of the main bundle) — the running editor creates them lazily via `new Worker(url)`, where
// `url` comes from monaco-setup.ts's `MonacoEnvironment.getWorkerUrl` override. Bundled here
// as their own IIFEs (same format/target as the main bundle) rather than left as bare
// node_modules files, since the host has no module resolution of its own at runtime. Only
// json/css/html/ts get a real language-service worker (Monaco ships those four); every other
// launch-list language (c, cpp, python, java, dotnet, sql, yaml, ...) falls back to the
// generic editor.worker for tokenization — see CodeEditor.tsx's doc comment.
const workerEntries = {
  'editor.worker': 'monaco-editor/editor/editor.worker.js',
  'json.worker': 'monaco-editor/language/json/json.worker.js',
  'css.worker': 'monaco-editor/language/css/css.worker.js',
  'html.worker': 'monaco-editor/language/html/html.worker.js',
  'ts.worker': 'monaco-editor/language/typescript/ts.worker.js',
};
for (const [name, entry] of Object.entries(workerEntries)) {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    outfile: `dist/host-code/workers/${name}.js`,
  });
}
