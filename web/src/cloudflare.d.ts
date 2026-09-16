/**
 * The Worker runtime's own environment, declared rather than depended on.
 *
 * `cloudflare:workers` is provided by workerd itself — there is nothing to
 * install and nothing to bundle. The types normally arrive with
 * `@cloudflare/workers-types` or a generated `worker-configuration.d.ts`, and
 * neither is worth a dependency for one import (CLAUDE.md §2), so the shape is
 * written out here.
 *
 * WHY IT IS READ THIS WAY AT ALL. `Astro.locals.runtime.env` was removed in
 * Astro v6 and throws at request time; `import.meta.env` is inlined at BUILD
 * time and a Cloudflare secret is not present then. Either mistake produces a
 * route that works locally and fails on the deployed site.
 *
 * ONE ENTRY PER SECRET WE ACTUALLY READ, named, so this file doubles as the
 * list of what the Worker needs configured. Nothing here may be read from
 * client-side code: these are secrets, and the editor reaches them only
 * through a server route (web/src/pages/api/description.ts).
 */
declare module 'cloudflare:workers' {
  export const env: {
    /**
     * DeepSeek, for the suggested Hebrew listing description.
     *
     *   npx wrangler secret put DEEPSEEK_API_KEY
     *
     * Optional. Without it the editor falls back to the paragraph built from
     * the seller's own answers, which is why the feature ships working on a
     * deploy that has never had a key.
     */
    DEEPSEEK_API_KEY?: string;

    /**
     * A self-hosted OSRM with the FOOT profile, e.g. `https://osrm.fly.dev`.
     *
     *   npx wrangler secret put OSRM_URL
     *
     * Optional, and it is the preferred router when set (CLAUDE.md §2). `osrm/`
     * in this repository builds and deploys the service; docs/OSRM.md has the
     * graph build. Without it, walking times come from the OpenStreetMap
     * Foundation's Valhalla instead — see web/src/lib/routing.ts, which also
     * records why the public OSRM demo server cannot be used.
     */
    OSRM_URL?: string;
  };
}
