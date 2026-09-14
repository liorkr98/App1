import cloudflare from '@astrojs/cloudflare';
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
  // SITE_URL MUST BE SET IN THE DEPLOY ENVIRONMENT. It is not optional and
  // there is no automatic fallback that works here.
  //
  // CF_PAGES_URL is kept only for a Cloudflare PAGES project, which sets it
  // per deploy. This site is deployed as a WORKER, and Workers Builds does
  // NOT set it — so without SITE_URL every card on the deployed site pointed
  // at https://example.com/... . Confirmed by reading og:image off the live
  // page, not inferred: the pages built, every check passed, and the single
  // most important URL in the product was a placeholder.
  //
  // The FALLBACK IS THE REAL HOST, not example.com. A placeholder here is
  // never the right answer: it silently produces share messages and preview
  // cards pointing at a domain nobody owns, and everything still builds green.
  //
  // SITE_URL still overrides it, and must be set to the custom domain the day
  // theyaad.co.il is attached. Until then the workers.dev origin is correct, so
  // a build with no variables set produces working links instead of broken
  // ones. See docs/DEPLOY.md.
  site:
    process.env.SITE_URL ??
    process.env.CF_PAGES_URL ??
    'https://besivov.liorkr98.workers.dev',

  /*
   * STATIC EVERYWHERE EXCEPT THE LISTING PAGE.
   *
   * This said `output: 'static'` with no adapter, and the consequence was not
   * a performance choice — it was that A REAL LISTING COULD NEVER HAVE A
   * PAGE. getStaticPaths() returns the two demo slugs from listings.ts, so a
   * link an agent actually shared would 404. The whole product is that link.
   *
   * Only /a/[slug] opts out of prerendering (`export const prerender = false`
   * in that file). The homepage, the dashboard, /new and /me stay static
   * files on the CDN exactly as before.
   *
   * CLAUDE.md §2 said "no runtime rendering", and the reason given was that an
   * adapter would put a cold start in front of the WhatsApp preview scraper.
   * That rule was written when listings were build-time sample data. It is
   * updated there rather than quietly broken here — and the alternative,
   * rebuilding the site on every publish, puts a one-to-two minute wait
   * between an agent pressing publish and their link existing, which is worse
   * for the same scraper and much worse for the agent.
   */
  adapter: cloudflare({ imageService: 'compile' }),
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
    /*
     * Supabase is not pre-bundled for the SSR runtime.
     *
     * `astro dev` runs the listing route inside workerd now, and Vite's SSR
     * dependency optimizer produced a chunk it then could not find:
     *
     *   The file does not exist at ".../deps_ssr/base-Cr1Nqci9.js?v=..."
     *   which is in the optimize deps directory.
     *
     * The dev server exited 1 on every boot. The build was unaffected, which
     * is exactly the kind of difference that gets discovered by somebody else
     * later. Excluding the package is the fix its own error message suggests.
     */
    optimizeDeps: {
      exclude: ['@supabase/supabase-js', 'astro/assets/services/noop'],
    },
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
