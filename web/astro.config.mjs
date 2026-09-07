import { defineConfig } from 'astro/config';

/**
 * Static output only.
 *
 * These pages load over Israeli cellular and must be Google-indexable, so
 * every page is pre-rendered at build time and served from Cloudflare Pages
 * as a file. There is no runtime rendering and no server adapter — adding one
 * would put a cold start in front of the WhatsApp preview scraper.
 */
export default defineConfig({
  // Absolute OG image URLs are built from this. WhatsApp rejects relative
  // ones, and a wrong host here silently produces a preview card with no
  // image — the single most expensive failure in the product.
  //
  // Cloudflare Pages sets CF_PAGES_URL on every build, so a preview deploy
  // gets its own hostname and the card works there too. SITE_URL overrides it
  // for the production custom domain. See docs/DEPLOY.md.
  //
  // The example.com default only applies to a local build, where nothing is
  // fetching the card anyway.
  site: process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'https://example.com',

  output: 'static',
  build: { format: 'directory' },

  // Share the Listing type and category schemas with the mobile app without
  // making the repo an npm workspace. Turning the root into a workspace root
  // would rewrite the React Native dependency tree for no benefit here.
  // Must mirror the "paths" entry in web/tsconfig.json. tsconfig paths guide
  // the typechecker; this guides the bundler. If they disagree, the build and
  // the typecheck disagree about what the code means.
  vite: {
    resolve: {
      alias: {
        '@': new URL('../src', import.meta.url).pathname,
      },
    },
  },
});
