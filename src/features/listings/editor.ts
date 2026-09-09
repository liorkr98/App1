import type { Fact, TemplateId } from '../../types/listing.js';
// ListingCategory comes from the schemas module, not from types/listing.js —
// that file imports the name for its own use and does not re-export it.
import type { ListingCategory } from './schemas/index.js';
import { isUnedited } from './description.js';

/**
 * The editor's state machine.
 *
 * Pure, and separate from the React island on purpose. What may happen next,
 * and what stops a listing being published, are product rules — they deserve
 * tests and they should not live inside a component where the only way to
 * check them is to click through a form on a phone.
 *
 * Flow (E1):
 *   category → photos → (vehicle: plate) → facts → description → template
 *   → preview → publish
 */

export const STEPS = [
  'category',
  'photos',
  'plate',
  'facts',
  'description',
  'template',
  'preview',
  'publish',
] as const;

export type Step = (typeof STEPS)[number];

/**
 * Images per listing, capped at 25 (CLAUDE.md §8).
 *
 * The user thinks in listings; our cost is in images. The cap is what bridges
 * the two, and it is a product decision rather than a technical limit — which
 * is why it lives here beside the flow and not in the upload code.
 */
export const MAX_IMAGES = 25;

/** At least one, because index 0 is the cover the WhatsApp card is cut from. */
export const MIN_IMAGES = 1;

/**
 * Entitlement as the editor sees it.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8: the paywall may be built here, but entitlement may NOT be
 * decided here. This type is the whole surface through which that decision
 * arrives, and `unknown` exists so that "we could not reach the provider" is
 * representable rather than collapsing into a boolean that has to guess.
 *
 * FAIL CLOSED: only 'paid' unblocks publishing. 'unknown' does not, and a
 * network failure must produce 'unknown' rather than 'paid'.
 * ======================================================================
 */
export type Entitlement = 'paid' | 'unpaid' | 'unknown';

export interface EditorState {
  category?: ListingCategory;
  photoCount: number;
  facts: readonly Fact[];
  description: string;
  /** What the model produced, if it was asked. Absent when the seller wrote it. */
  generatedDescription?: string;
  template?: TemplateId;
  entitlement: Entitlement;
}

/** Steps that apply to this listing. Property never sees the plate step. */
export function stepsFor(category: ListingCategory | undefined): Step[] {
  return STEPS.filter((step) => step !== 'plate' || category === 'vehicle');
}

export interface Blocker {
  step: Step;
  /** Hebrew, because it is shown to the seller. */
  message: string;
}

/**
 * Everything standing between this state and a published page.
 *
 * Returns ALL blockers rather than the first. A seller who fixes one thing and
 * is immediately told about another has been made to walk the form twice, and
 * on a phone that is where people give up.
 */
export function blockers(state: EditorState): Blocker[] {
  const found: Blocker[] = [];

  if (!state.category) {
    found.push({ step: 'category', message: 'צריך לבחור סוג מודעה' });
  }

  if (state.photoCount < MIN_IMAGES) {
    found.push({ step: 'photos', message: 'צריך להעלות לפחות תמונה אחת' });
  }
  if (state.photoCount > MAX_IMAGES) {
    found.push({
      step: 'photos',
      message: `אפשר להעלות עד ${MAX_IMAGES} תמונות`,
    });
  }

  // Only the three required facts per category. A required field the seller
  // cannot answer is a form they abandon (PRD §2), so the bar stays low.
  const missing = state.facts.filter(
    (fact) => fact.required && (fact.value === null || fact.value === ''),
  );
  for (const fact of missing) {
    found.push({ step: 'facts', message: `חסר: ${fact.label}` });
  }

  if (state.description.trim() === '') {
    found.push({ step: 'description', message: 'צריך לכתוב תיאור' });
  } else if (
    state.generatedDescription &&
    isUnedited(state.generatedDescription, state.description)
  ) {
    // E6. Not because the model writes badly — because the seller is the one
    // making a representation about their own property, and a description
    // nobody read is a claim nobody stands behind.
    found.push({
      step: 'description',
      message: 'עברו על התיאור ותקנו אותו לפני הפרסום',
    });
  }

  if (!state.template) {
    found.push({ step: 'template', message: 'צריך לבחור תבנית' });
  }

  // ========================== HUMAN REVIEW ==========================
  // The entitlement read. Anything that is not 'paid' blocks publishing,
  // including 'unknown' — a provider we could not reach is not a licence
  // to give the product away (CLAUDE.md §8).
  // ==================================================================
  if (state.entitlement !== 'paid') {
    found.push({
      step: 'publish',
      message:
        state.entitlement === 'unpaid'
          ? 'הפרסום דורש תשלום'
          : 'לא הצלחנו לאמת את התשלום. נסו שוב בעוד רגע.',
    });
  }

  return found;
}

/**
 * Whether the seller may leave `step`.
 *
 * Only checks blockers belonging to that step, so someone can reach the
 * preview with an unpaid listing and SEE their finished page. That is the
 * conversion moment (§8) and gating it earlier would hide the thing that sells
 * the product.
 */
export function canAdvance(step: Step, state: EditorState): boolean {
  return !blockers(state).some((blocker) => blocker.step === step);
}

/**
 * The publish gate.
 *
 * ============================ HUMAN REVIEW ============================
 * The single place access is granted. Every blocker must be clear, which
 * includes the entitlement one — so this returns false whenever payment is
 * unconfirmed, and there is no branch that grants on error.
 * ======================================================================
 */
export function canPublish(state: EditorState): boolean {
  return blockers(state).length === 0;
}

/**
 * The step to land a seller on.
 *
 * The FIRST step with an outstanding blocker — the one that needs work — not
 * the last completed one. Returning "the furthest step you finished" sounds
 * equivalent and is not: a seller coming back to a listing missing photos
 * would land on the category picker they already answered, and have to walk
 * forward through finished steps to find the thing that needs them.
 *
 * When nothing is outstanding the answer is `publish`. When only payment is,
 * it is also `publish` — that step is where the paywall lives, so sending
 * them there shows the one action left rather than hiding it behind the
 * preview.
 */
export function nextStep(state: EditorState): Step {
  const outstanding = blockers(state);

  for (const step of stepsFor(state.category)) {
    if (outstanding.some((blocker) => blocker.step === step)) return step;
  }

  return 'publish';
}
