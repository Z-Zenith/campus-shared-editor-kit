// SDA-19/SEK-01: bundles the SEK host entries (notes editor, code editor) into standalone
// scripts an Avalonia NativeWebView can load with no bundler/node_modules of its own. A
// plain Node script (not npm-script shell chaining) so it runs identically on Windows and
// POSIX shells.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/host', { recursive: true });
mkdirSync('dist/host-code', { recursive: true });

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
});
cpSync('host/code-index.html', 'dist/host-code/index.html');
cpSync('host/sek-host.css', 'dist/host-code/sek-host.css');
