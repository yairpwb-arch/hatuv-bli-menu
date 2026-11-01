// Copies MapLibre's map worker to public/ as a plain .js file, before dev and
// build. The app points MapLibre at it (WalkMap.tsx): MapLibre's own lookup
// finds nothing in the bundled app, and native web views don't reliably serve
// .mjs files with a JavaScript type. Kept out of git; regenerated each run, so
// it always matches the installed maplibre-gl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.copyFileSync(
  path.join(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
  path.join(root, 'public/maplibre-gl-worker.js'),
);
