import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Serves MapLibre's own build files, unchanged, from a versioned path.
 *
 * WHY NOT LET VITE BUNDLE IT. MapLibre 6 ships three ES modules — the map,
 * a chunk shared with its web worker, and the worker — and finds the worker
 * next to itself with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
 * Rebundled, that file is not next to it any more, and the worker either
 * fails or gets its own copy of the shared chunk (~150 KB gzipped twice).
 * Served as published, the map and the worker share one cached chunk.
 *
 * WHY NOT web/public. MapLibre's CSS uses physical left/right, and
 * verify-web-logical-props scans web/public. These files are a published
 * library, not our CSS, so they are copied into the build output after the
 * build, and served from node_modules by the dev server.
 *
 * The path carries the version, so a new MapLibre is a new URL and no
 * browser keeps an old file under it. The listing page reads the path from
 * `import.meta.env.PUBLIC_MAPLIBRE_BASE` (defined here) and loads nothing
 * from it until the map section is near the screen (scripts/listing-map.ts).
 */

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve('maplibre-gl/package.json'));
const { version } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

export const MAPLIBRE_BASE = `/vendor/maplibre-gl-${version}/`;

const FILES = {
  'maplibre-gl.mjs': 'text/javascript',
  'maplibre-gl-shared.mjs': 'text/javascript',
  'maplibre-gl-worker.mjs': 'text/javascript',
  'maplibre-gl.css': 'text/css',
};

/** The published file, without its source-map comment: the maps are not shipped. */
function read(name) {
  const text = fs.readFileSync(path.join(packageDir, 'dist', name), 'utf8');
  return text.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n').replace(/\/\*# sourceMappingURL=\S+ \*\/\s*$/, '');
}

export default function vendorMapLibre() {
  return {
    name: 'vendor-maplibre',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: { define: { 'import.meta.env.PUBLIC_MAPLIBRE_BASE': JSON.stringify(MAPLIBRE_BASE) } },
        });
      },

      'astro:server:setup': ({ server }) => {
        server.middlewares.use((request, response, next) => {
          const url = request.url ?? '';
          if (!url.startsWith(MAPLIBRE_BASE)) return next();
          const name = url.slice(MAPLIBRE_BASE.length).split('?')[0];
          const type = FILES[name];
          if (!type) return next();
          response.setHeader('Content-Type', `${type}; charset=utf-8`);
          response.end(read(name));
        });
      },

      'astro:build:done': ({ dir }) => {
        const target = path.join(fileURLToPath(dir), MAPLIBRE_BASE);
        fs.mkdirSync(target, { recursive: true });
        for (const name of Object.keys(FILES)) fs.writeFileSync(path.join(target, name), read(name));
        // BSD-3 asks for the notice to travel with the files.
        fs.copyFileSync(path.join(packageDir, 'LICENSE.txt'), path.join(target, 'LICENSE.txt'));

        /*
         * Their types, said outright. A module script served with any other
         * type is refused by the browser, silently, and the map never loads;
         * Cloudflare infers types from extensions, and `.mjs` is the one not
         * worth leaving to inference. Cached for a year: the path is versioned.
         */
        const headers = path.join(fileURLToPath(dir), '_headers');
        const rules = Object.entries(FILES)
          .map(([name, type]) =>
            `${MAPLIBRE_BASE}${name}\n  Content-Type: ${type}; charset=utf-8\n  Cache-Control: public, max-age=31536000, immutable\n`,
          )
          .join('\n');
        const existing = fs.existsSync(headers) ? fs.readFileSync(headers, 'utf8') : '';
        fs.writeFileSync(headers, `${existing.replace(/\s*$/, '\n\n')}${rules}`);
      },
    },
  };
}
