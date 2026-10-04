import { TEMPLATE_MANIFEST, templateFits } from '@/features/templates/manifest';
import { TEMPLATE_IDS, type TemplateId } from '@/types/listing';

/**
 * What the browser checks open, derived from the manifest so a new template
 * is measured the day it is added (the same reason the picker and the gates
 * enumerate TEMPLATE_IDS rather than a second list).
 *
 * Only the Living Surfaces templates — the 2.0 catalogue. The 1.x ids stay
 * valid for old rows and are covered by the existing file-level gates.
 * Property templates open on the Tel Aviv fixture (T4V7A), car templates on
 * the Golf (G7F2K): each template on a listing it was drawn for.
 */
const PROPERTY = 'T4V7A';
const VEHICLE = 'G7F2K';

export interface CheckPage {
  name: string;
  path: string;
}

export const TEMPLATE_PAGES: CheckPage[] = TEMPLATE_IDS.filter(
  (id): id is TemplateId => TEMPLATE_MANIFEST[id].ls !== undefined,
).map((id) => {
  const slug = templateFits(id, 'property') ? PROPERTY : VEHICLE;
  return { name: id, path: `/template-check/${slug}-${id}/` };
});

/** The site pages a visitor reaches before any listing. Signed out. */
export const SITE_PAGES: CheckPage[] = [
  { name: 'home', path: '/' },
  { name: 'new', path: '/new/' },
  { name: 'pricing', path: '/pricing/' },
];

/** One WhatsApp card per look (share-card.ts cardFamily). */
export const CARD_PAGES: CheckPage[] = [
  'T4V7A-aurora',
  'T4V7A-atelier',
  'T4V7A-blueprint',
  'T4V7A-poster',
  'T4V7A-zine',
  'T4V7A-ticket',
  'G7F2K-dossier',
].map((slug) => ({ name: `card-${slug}`, path: `/template-check/card/${slug}/` }));
