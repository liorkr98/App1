import { TEMPLATE_IDS, type TemplateId } from '../../types/listing.js';

/**
 * What each template is, in one table (היעד 2.0, plan §5).
 *
 *   ls        the Living Surfaces mode. A template with one gets data-ls on
 *             <html>: the --ls-* tokens, the self-hosted display face and the
 *             shared motion module. Without one it renders exactly as 1.x.
 *   composed  which first screen Stage.astro composes. Without one the page
 *             keeps the shared hero and restyles it.
 *   keyCells  how many numerals that composed first screen shows.
 *
 * TEMPLATE_IDS stays the list of ids (the DB check, the picker and the
 * homepage enumerate it); this is what the page needs to know about each.
 * Record<TemplateId, …> makes a new id without an entry a type error.
 */
export type ComposedLayout = 'gallery' | 'showcase' | 'aurora' | 'blueprint';

export interface TemplateSpec {
  ls?: 'paper' | 'onyx';
  composed?: ComposedLayout;
  keyCells?: number;
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
