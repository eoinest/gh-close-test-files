import { copyFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { force: true, recursive: true });
await mkdir('dist', { recursive: true });

await build({
  bundle: true,
  entryPoints: ['src/content.ts'],
  format: 'iife',
  logLevel: 'info',
  minify: false,
  outfile: 'dist/content.js',
  sourcemap: false,
  target: ['chrome120'],
});

await copyFile('static/manifest.json', 'dist/manifest.json');

