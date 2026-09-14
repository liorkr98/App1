import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

/**
 * Mostly static, with on-demand listing routes.
 *
 * Homepage, editor, legal and the CI fixtures prerender. `/a/[slug]`,
 * `/a/[slug]/share`, the PDF stub and the sitemap run at request time so a
 * real agent's slug exists without a rebuild.
 *
 * `@astrojs/cloudflare` is the adapter this host already deploys with
 * (Workers Builds + wrangler.jsonc). It is not a stack substitution: listing
 * pages stay Astro HTML, and prerendered routes are still files. Size is the
 * official adapter; it tracks Astro's own release. Without it, `prerender =
 * false` has nowhere to run.
 *
 * imageService is passthrough — we do not use Astro's <Image>, and the
 * default cloudflare-binding would provision an Images binding we do not
 * want. session is off: no KV namespace for a product that does not use
 * Astro sessions.
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
  // hasivuv.com is attached. Until then the workers.dev origin is correct, so
  // a build with no variables set produces working links instead of broken
  // ones. See docs/DEPLOY.md.
  site:
    process.env.SITE_URL ??
    process.env.CF_PAGES_URL ??
    'https://besivov.liorkr98.workers.dev',

  output: 'static',
  build: { format: 'directory' },
  session: false,

  adapter: cloudflare({
    imageService: 'passthrough',
    // wrangler.jsonc lives at the repo root because Workers Builds runs from
    // there. The Astro project is web/.
    configPath: '../wrangler.jsonc',
  }),

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
