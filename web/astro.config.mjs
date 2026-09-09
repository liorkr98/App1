import react from '@astrojs/react';
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

  // React exists for ONE page. /new is a multi-step form with drag-ordered
  // photos and live validation, which is a genuine application; the listing
  // pages stay pure HTML and ship no JavaScript at all.
  //
  // Astro only sends a framework to pages that use an island, so this costs
  // the listing pages nothing — and report-page-weight.mjs now attributes
  // bundles per page, so if that ever stops being true the number will say so
  // instead of averaging it away.
  integrations: [react()],

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
        // Hebrew copy (CLAUDE.md §12). Same mirroring rule as "@" above: this
        // guides the bundler, the "paths" entry guides the typechecker, and
        // if they disagree the build and the typecheck disagree about what
        // the code means.
        '@locales': new URL('../locales', import.meta.url).pathname,
      },
    },
  },
});
