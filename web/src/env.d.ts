/**
 * Build-time constants defined by our own integrations, so they are typed
 * where they are read.
 */
interface ImportMetaEnv {
  /** Where MapLibre's files are served, versioned (integrations/vendor-maplibre.mjs). */
  readonly PUBLIC_MAPLIBRE_BASE: string;
}
