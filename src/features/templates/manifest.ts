import type { ListingCategory } from '../listings/schemas/index.js';
import { TEMPLATE_IDS, type TemplateId } from '../../types/listing.js';

/**
 * What each template is, in one table (היעד 2.0, plan §5).
 *
 *   ls          the Living Surfaces mode. A template with one gets data-ls on
 *               <html>: the --ls-* tokens, the self-hosted display face and
 *               the shared motion module. Without one it renders as 1.x.
 *   composed    which first screen Stage.astro composes. Without one the
 *               page keeps the shared hero and restyles it.
 *   keyCells    how many numerals that composed first screen shows.
 *   categories  the listing categories it is drawn for. Absent means both.
 *               Showroom and Dossier are cars; Heliograph (a balcony's
 *               sun) and Walk (walking minutes from the door) are homes. The
 *               wrong category is a porting accident, not a choice.
 *
 * TEMPLATE_IDS stays the list of ids (the DB check, the picker and the
 * homepage enumerate it); this is what the page needs to know about each.
 * Record<TemplateId, …> makes a new id without an entry a type error.
 */
export type ComposedLayout =
  | 'gallery'
  | 'showcase'
  | 'aurora'
  | 'blueprint'
  | 'monolith'
  | 'atelier'
  | 'glass'
  | 'showroom'
  | 'heliograph'
  | 'walk'
  | 'poster'
  | 'zine'
  | 'dossier'
  | 'ticket';

export interface TemplateSpec {
  ls?: 'paper' | 'onyx';
  composed?: ComposedLayout;
  keyCells?: number;
  categories?: readonly ListingCategory[];
}

export const TEMPLATE_MANIFEST: Record<TemplateId, TemplateSpec> = {
  agency: {},
  editorial: {},
  dark: {},
  walkFirst: {},
  brochure: {},
  linen: {},
  studio: {},
  gallery: { composed: 'gallery', keyCells: 4 },
  showcase: { composed: 'showcase', keyCells: 3 },
  aurora: { ls: 'onyx', composed: 'aurora', keyCells: 4 },
  blueprint: { ls: 'paper', composed: 'blueprint', keyCells: 4 },
  monolith: { ls: 'onyx', composed: 'monolith', keyCells: 4 },
  atelier: { ls: 'paper', composed: 'atelier', keyCells: 3 },
  glass: { ls: 'onyx', composed: 'glass', keyCells: 4 },
  showroom: { ls: 'onyx', composed: 'showroom', keyCells: 4, categories: ['vehicle'] },
  // Round two: each built on one thing only this listing has.
  heliograph: { ls: 'paper', composed: 'heliograph', keyCells: 4, categories: ['property'] },
  walk: { ls: 'paper', composed: 'walk', keyCells: 4, categories: ['property'] },
  poster: { ls: 'paper', composed: 'poster', keyCells: 4 },
  zine: { ls: 'paper', composed: 'zine', keyCells: 4 },
  dossier: { ls: 'paper', composed: 'dossier', keyCells: 4, categories: ['vehicle'] },
  ticket: { ls: 'paper', composed: 'ticket', keyCells: 4 },
};

/**
 * Ids that no longer exist, and what a row or a saved draft carrying one
 * renders as. `cinema` became Aurora (P3): same full-bleed idea, rebuilt on
 * Living Surfaces. An alias is permanent — a link sent in a WhatsApp group
 * outlives any migration, and must never fall through to the default.
 */
export const LEGACY_TEMPLATE_ALIASES: Readonly<Record<string, TemplateId>> = {
  cinema: 'aurora',
};

export const DEFAULT_TEMPLATE: TemplateId = 'agency';

/**
 * What a template that does not fit the listing's category renders as.
 * Aurora keeps the dark, full-bleed feel a seller who chose Showroom wanted.
 */
export const CATEGORY_FALLBACK: TemplateId = 'aurora';

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value);
}

/** A current id, an alias's target, or undefined for anything else. */
export function knownTemplateId(value: unknown): TemplateId | undefined {
  if (isTemplateId(value)) return value;
  if (typeof value === 'string' && Object.hasOwn(LEGACY_TEMPLATE_ALIASES, value)) {
    return LEGACY_TEMPLATE_ALIASES[value];
  }
  return undefined;
}

/** For rendering: never fails, an unknown id gets the default template. */
export function resolveTemplateId(value: unknown): TemplateId {
  return knownTemplateId(value) ?? DEFAULT_TEMPLATE;
}

export function templateSpec(template: TemplateId): TemplateSpec {
  return TEMPLATE_MANIFEST[template];
}

export function templateFits(template: TemplateId, category: ListingCategory): boolean {
  const categories = TEMPLATE_MANIFEST[template].categories;
  return categories === undefined || categories.includes(category);
}

/** The template a listing of this category is actually drawn with. */
export function templateFor(template: TemplateId, category: ListingCategory): TemplateId {
  return templateFits(template, category) ? template : CATEGORY_FALLBACK;
}

/** The ids the picker offers for a category, in TEMPLATE_IDS order. */
export function templatesFor(category: ListingCategory): TemplateId[] {
  return TEMPLATE_IDS.filter((id) => templateFits(id, category));
}
