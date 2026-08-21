import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { force: true, recursive: true });
await mkdir('dist', { recursive: true });
const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));

await build({
  bundle: true,
  define: {
    __EXTENSION_VERSION__: JSON.stringify(manifest.version),
  },
  entryPoints: ['src/content.ts'],
  format: 'iife',
  logLevel: 'info',
  minify: false,
  outfile: 'dist/content.js',
  sourcemap: false,
  target: ['chrome120'],
});

await copyFile('static/manifest.json', 'dist/manifest.json');
