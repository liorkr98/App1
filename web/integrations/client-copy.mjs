/**
 * Page-only copy stays out of the browser (13 Oct 2026).
 *
 * src/lib/i18n.ts imports the whole of locales/he.json, and the editor's
 * island imports i18n, so every string in the file ships to /new/ — whether
 * or not a script ever reads it. The template pages, the audience pages and
 * the guides added about 33 KB of copy that only .astro frontmatter renders,
 * at build time, and /new/ went over its 900 KB budget on text no script
 * reads.
 *
 * These top-level namespaces are removed from the locale files in the CLIENT
 * build only. The server build (every prerendered page, and the Worker)
 * still reads the full file, so the pages render exactly as before.
 *
 * THE RISK, AND ITS GUARD. A browser script that someday calls
 * t('guides.title') would show the raw key. scripts/verify-client-copy.mjs
 * fails the build when any client bundle names a key in one of these
 * namespaces, and its -fires.sh proves the check still matches.
 */
// home, lab, flyer and notFound joined on 15 Oct 2026, when the photo drag
// and the publish moment took /new/ back over by 4 KB: all four are rendered
// by .astro frontmatter alone. seo, footer, a11y, language, enrich and source
// followed on 17 Oct 2026 for the first-listing hints (also frontmatter only),
// with settings and paywall, which only the retired app's SettingsScreen read.
export const SERVER_ONLY_NAMESPACES = [
  'templates',
  'audiences',
  'guides',
  'agentPage',
  'adminData',
  'home',
  'lab',
  'flyer',
  'notFound',
  'seo',
  'footer',
  'a11y',
  'language',
  'enrich',
  'source',
  'settings',
  'paywall',
  'empty',
  'vehicle',
  'sign',
  'pay',
];

/**
 * COPY PER PAGE (19 Oct 2026). Namespaces one area's scripts read and the
 * editor never does: the dashboard, the admin, sign-in, the phone upload and
 * the contact form. Removed from the client he.json like the ones above, and
 * served alone as `@locales/he.json?copy=<namespace>`, which the page that
 * reads them imports through web/src/lib/copy/<namespace>.ts (it registers
 * the namespace with i18n's addCopy). /new/ went over its budget again on
 * copy only /mine/ reads.
 *
 * THE GUARD: scripts/verify-client-copy.mjs refuses a client chunk that
 * names one of these keys without loading its copy (itself or through a
 * chunk it imports), and its -fires.sh proves the check still matches.
 */
export const PAGE_NAMESPACES = ['dash', 'admin', 'auth', 'phoneUpload', 'legal'];

const LOCALE = /[\\/]locales[\\/](he|en)\.json$/;

export default function clientCopy() {
  return {
    name: 'client-copy',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'client-copy:prune',
                enforce: 'pre',
                transform(code, id, options) {
                  const [file, query = ''] = id.split('?');
                  if (options?.ssr || !LOCALE.test(file)) return undefined;
                  const copy = JSON.parse(code);
                  const page = new URLSearchParams(query).get('copy');
                  if (page) {
                    if (!PAGE_NAMESPACES.includes(page)) throw new Error(`client-copy: ${page} is not a page namespace`);
                    // A module, not JSON: Vite's JSON plugin leaves an id with a query alone.
                    return { code: `export default ${JSON.stringify({ [page]: copy[page] })};`, map: null };
                  }
                  for (const namespace of [...SERVER_ONLY_NAMESPACES, ...PAGE_NAMESPACES]) delete copy[namespace];
                  return { code: JSON.stringify(copy), map: null };
                },
              },
            ],
          },
        });
      },
    },
  };
}
