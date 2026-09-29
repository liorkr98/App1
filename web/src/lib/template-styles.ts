import type { TemplateId } from '@/types/listing';

/**
 * One stylesheet per 2.0 template, loaded only by pages drawn with it.
 *
 * The 1.x token templates are small and stay in the shared listing CSS. The
 * 2.0 templates each carry a whole composed first screen, and bundling all of
 * them sent every buyer the CSS of twenty templates to read one — it pushed
 * the heaviest fixture pages over report-page-weight's budget. Vite emits
 * each file as its own hashed asset and BaseListing links the one it needs.
 * (Astro places its own shared sheet after it, which is the order the
 * @imports had: template selectors win by specificity, not by position.)
 *
 * The globs are listed, not `*.css`, so the 1.x token sheets — still bundled
 * in listing.css — are not emitted a second time as unused assets.
 *
 * The CSS gates (absent-contrast, motion-guard) read every one of these from
 * the build, not just the sheet one page links: see TEMPLATE_SHEET_PREFIX.
 */
const SHEETS = import.meta.glob<string>(
  [
    '../styles/templates/aurora.css',
    '../styles/templates/blueprint.css',
    '../styles/templates/monolith.css',
    '../styles/templates/atelier.css',
    '../styles/templates/glass.css',
    '../styles/templates/showroom.css',
    '../styles/templates/heliograph.css',
    '../styles/templates/walk.css',
    '../styles/templates/poster.css',
    '../styles/templates/zine.css',
    '../styles/templates/dossier.css',
    '../styles/templates/ticket.css',
  ],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
);

/** The 2.0 templates, which ship as their own stylesheet. */
export const SPLIT_TEMPLATES: readonly TemplateId[] = [
  'aurora',
  'blueprint',
  'monolith',
  'atelier',
  'glass',
  'showroom',
  'heliograph',
  'walk',
  'poster',
  'zine',
  'dossier',
  'ticket',
];

export function templateStylesheet(template: TemplateId): string | undefined {
  if (!SPLIT_TEMPLATES.includes(template)) return undefined;
  return SHEETS[`../styles/templates/${template}.css`];
}
