import type { Fact, FactType, FactValue, TemplateId } from '../../types/listing.js';
import type { EditorState } from './editor.js';
import { LISTING_CATEGORIES, type ListingCategory } from './schemas/index.js';

/**
 * Saving and restoring an unpublished draft.
 *
 * PRD §4 locks "no account until publish". That is the right call for a
 * one-time seller, and it has a consequence: until they pay there is nowhere
 * to put their work but their own browser. A refresh on a phone — a call
 * coming in, the tab evicted for memory — otherwise costs them the whole
 * afternoon, and nobody starts again.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. A draft is read back from storage the USER CONTROLS. Anyone
 * can open devtools and edit it.
 *
 * So entitlement is NOT part of a draft. `toDraft` never writes it and
 * `fromDraft` never returns it — not as a field to be ignored later, but
 * absent from the type, so restoring a draft cannot produce a paid listing
 * no matter what the stored JSON says. Entitlement is re-read from the
 * provider on load, and a provider that cannot be reached yields 'unknown',
 * which blocks publishing.
 *
 * Written this way round deliberately: a restore that copied every field and
 * then reset entitlement would be one forgotten line away from giving the
 * product away, and that line would look like cleanup to whoever removed it.
 * ======================================================================
 */

/** Bumped whenever the shape below changes incompatibly. */
export const DRAFT_VERSION = 1;

/** Everything a draft holds. Note what is missing: entitlement. */
export type Draft = Omit<EditorState, 'entitlement'>;

interface Stored extends Draft {
  version: number;
}

export function toDraft(state: EditorState): Stored {
  return {
    version: DRAFT_VERSION,
    ...(state.category === undefined ? {} : { category: state.category }),
    photoCount: state.photoCount,
    facts: state.facts,
    description: state.description,
    ...(state.generatedDescription === undefined
      ? {}
      : { generatedDescription: state.generatedDescription }),
    ...(state.template === undefined ? {} : { template: state.template }),
  };
}

const TEMPLATES: readonly TemplateId[] = ['clean', 'gallery', 'luxury'];
const FACT_TYPES: readonly FactType[] = ['text', 'number', 'boolean', 'enum', 'date'];

/**
 * Rebuilds a draft from whatever was in storage.
 *
 * Returns null rather than throwing on anything it does not recognise. This
 * input is not merely untrusted, it is routinely CORRUPT in ordinary use: a
 * draft written by an older version of the app, a quota error that truncated
 * the JSON mid-write, a browser that cleared half its storage. None of those
 * are attacks and all of them arrive as malformed text, so the only useful
 * behaviour is to start clean.
 */
export function fromDraft(raw: unknown): Draft | null {
  if (typeof raw !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.version !== DRAFT_VERSION) return null;

  const facts = readFacts(parsed.facts);
  if (facts === null) return null;

  const category = readCategory(parsed.category);
  // A draft naming a category that no longer exists cannot have usable facts.
  if (parsed.category !== undefined && category === undefined) return null;

  const photoCount = parsed.photoCount;
  const description = parsed.description;
  if (typeof photoCount !== 'number' || !Number.isInteger(photoCount) || photoCount < 0) {
    return null;
  }
  if (typeof description !== 'string') return null;

  const generated = parsed.generatedDescription;
  if (generated !== undefined && typeof generated !== 'string') return null;

  const template = parsed.template;
  if (template !== undefined && !TEMPLATES.includes(template as TemplateId)) return null;

  return {
    ...(category === undefined ? {} : { category }),
    photoCount,
    facts,
    description,
    ...(generated === undefined ? {} : { generatedDescription: generated }),
    ...(template === undefined ? {} : { template: template as TemplateId }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCategory(value: unknown): ListingCategory | undefined {
  return typeof value === 'string' && (LISTING_CATEGORIES as string[]).includes(value)
    ? (value as ListingCategory)
    : undefined;
}

/**
 * Facts, validated one field at a time.
 *
 * `present` and `source` are checked as strictly as the values are. A draft
 * claiming source:'verified' would put a מאומת badge and a citation on a
 * number the seller typed — the one thing PRD §5 calls legal rather than
 * stylistic — so anything that is not exactly 'seller' or 'verified' fails,
 * and a restored fact that says 'verified' without the enrichment that earns
 * it is rejected outright below.
 */
function readFacts(value: unknown): Fact[] | null {
  if (!Array.isArray(value)) return null;

  const facts: Fact[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) return null;

    const { key, label, type, present, required, source, value: factValue, unit } = entry;

    if (typeof key !== 'string' || key === '') return null;
    if (typeof label !== 'string' || label === '') return null;
    if (!FACT_TYPES.includes(type as FactType)) return null;
    if (typeof present !== 'boolean') return null;
    if (typeof required !== 'boolean') return null;
    if (unit !== undefined && typeof unit !== 'string') return null;
    if (!isFactValue(factValue)) return null;

    // Only 'seller' survives a round trip through storage. A verified fact is
    // one a public register answered, and the register is not the browser —
    // enrichment re-applies that on the server, with its name and its date.
    if (source !== 'seller') return null;

    facts.push({
      key,
      label,
      ...(unit === undefined ? {} : { unit }),
      type: type as FactType,
      value: factValue,
      present,
      required,
      source: 'seller',
    });
  }

  return facts;
}

function isFactValue(value: unknown): value is FactValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}
