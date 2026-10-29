/**
 * Build-time constants defined by our own integrations, so they are typed
 * where they are read.
 */
interface ImportMetaEnv {
  /** Where MapLibre's files are served, versioned (integrations/vendor-maplibre.mjs). */
  readonly PUBLIC_MAPLIBRE_BASE: string;
}

/** One namespace of he.json, for the page that reads it (integrations/client-copy.mjs). */
declare module '@locales/he.json?copy=*' {
  const copy: Record<string, unknown>;
  export default copy;
}
