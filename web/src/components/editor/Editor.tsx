import { useMemo, useState } from 'react';

import {
  blockers,
  canAdvance,
  canPublish,
  MAX_IMAGES,
  nextStep,
  stepsFor,
  type EditorState,
  type Step,
} from '@/features/listings/editor';
import { blankFacts } from '@/features/listings/fact-entry';
import { LISTING_CATEGORIES, schemaFor } from '@/features/listings/schemas';

import { t } from '../../lib/i18n';
import { DescriptionStep } from './DescriptionStep';
import { FactsStep } from './FactsStep';
import { Message } from './Message';
import { TemplateStep } from './TemplateStep';
import { useDraft } from './useDraft';

/**
 * The editor island (Stage E).
 *
 * All the rules live in @/features/listings/editor — what blocks publishing,
 * which steps a category has, where a returning seller lands. This file is
 * the presentation of those rules and holds no product logic of its own, so
 * the answer to "why can I not publish" is testable without a browser.
 *
 * BUILT SO FAR: category, facts, description, template.
 *
 * STILL EMPTY — each renders its heading and nothing else:
 *   - photos and plate. Photos needs an upload target, and R2 vs Supabase
 *     Storage is undecided (CLAUDE.md §2 says R2; worker/src/storage.ts and
 *     migration 0004 still use Supabase Storage). Not mine to settle.
 *   - preview. It has to show the real listing page, and the site is static
 *     output — so a faithful preview means either a draft URL built by the
 *     pipeline or rendering the page markup twice. That is a design decision,
 *     not a component.
 *
 * The draft is kept in localStorage (useDraft), because PRD §4 locks "no
 * account until publish" and until the seller pays there is nowhere else to
 * put their work.
 *
 * Publish is inert, and gated on entitlement with no provider chosen.
 * Entitlement is hard-coded to 'unknown' below. See the banner there.
 */

const START: EditorState = {
  photoCount: 0,
  facts: [],
  description: '',

  // ========================== HUMAN REVIEW ==========================
  // CLAUDE.md §8: I may build the paywall and may NOT decide entitlement.
  //
  // 'unknown' is the fail-closed value — it blocks publishing, which is
  // the correct behaviour for a client that has asked nobody. When a
  // provider exists this becomes a read from it, and the read must still
  // produce 'unknown' on any error rather than 'paid'.
  //
  // A seller can still reach the preview with this value, which is the
  // point: seeing the finished page is the conversion moment.
  // ==================================================================
  entitlement: 'unknown',
};

export default function Editor() {
  const [state, setState] = useState<EditorState>(START);
  const [step, setStep] = useState<Step>(() => nextStep(START));

  const steps = useMemo(() => stepsFor(state.category), [state.category]);
  const outstanding = useMemo(() => blockers(state), [state]);

  const position = steps.indexOf(step);
  const here = outstanding.filter((blocker) => blocker.step === step);

  /**
   * Restores a saved draft, then lands the seller on the step that needs
   * work rather than at the beginning.
   *
   * That is what nextStep is for. Someone coming back to a listing missing
   * only photos should see the photos step, not the category question they
   * answered yesterday.
   *
   * Entitlement is untouched: `Draft` has no such field. See useDraft.
   */
  useDraft(state, (draft) => {
    setState((current) => ({ ...current, ...draft }));
    setStep(nextStep({ ...START, ...draft }));
  });

  const go = (delta: number) => {
    const target = steps[position + delta];
    if (target) setStep(target);
  };

  /**
   * Choosing a category also builds its fact list.
   *
   * CHANGING it rebuilds from the new schema, discarding the old answers.
   * They cannot be carried over — the two schemas share no keys, and a
   * silent partial merge would leave a vehicle listing holding a room count.
   * Re-choosing the SAME category is a no-op, so a stray second tap on the
   * button already selected does not wipe the form.
   */
  const choose = (category: NonNullable<EditorState['category']>) => {
    setState((current) =>
      current.category === category
        ? current
        : { ...current, category, facts: blankFacts(category) },
    );
  };

  return (
    <main className="editor">
      <header className="rail">
        <p className="rail-count">
          <Message
            path="editor.stepOf"
            values={{ current: position + 1, total: steps.length }}
          />
        </p>
        <h1 className="rail-title">{t(`editor.steps.${step}`)}</h1>

        {/*
          The bar is decoration for a number that is already stated above it,
          so it is hidden from assistive technology rather than given a role
          that would read the same fact twice.

          It fills from the INLINE START, which in Hebrew is the right edge.
          A physical `left` here would fill it backwards, and it would look
          fine in every English screenshot.
        */}
        <div className="rail-bar" aria-hidden="true">
          <div
            className="rail-fill"
            style={{ inlineSize: `${((position + 1) / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <section className="step">
        {step === 'category' ? (
          <CategoryStep chosen={state.category} onChoose={choose} />
        ) : null}

        {step === 'facts' && state.category ? (
          <FactsStep
            category={state.category}
            facts={state.facts}
            onChange={(facts) => setState((current) => ({ ...current, facts }))}
          />
        ) : null}

        {step === 'template' ? (
          <TemplateStep
            chosen={state.template}
            onChoose={(template) => setState((current) => ({ ...current, template }))}
          />
        ) : null}

        {step === 'description' ? (
          <DescriptionStep
            text={state.description}
            generated={state.generatedDescription}
            facts={state.facts}
            onChange={(description) => setState((current) => ({ ...current, description }))}
          />
        ) : null}
      </section>

      {here.length > 0 ? (
        <section className="blockers" aria-live="polite">
          <h2 className="blockers-title">{t('editor.blockedTitle')}</h2>
          <ul>
            {here.map((blocker) => (
              <li key={`${blocker.code}:${blocker.factLabel ?? ''}`}>
                {/*
                  Both placeholders every time. Only the message that contains
                  one uses it, and passing the cap from MAX_IMAGES keeps 25 in
                  the single place that defines it.
                */}
                <Message
                  path={`editor.blockers.${blocker.code}`}
                  values={{ max: MAX_IMAGES, label: blocker.factLabel ?? '' }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Words, no chevrons. Back and forward ARE direction icons and so they
        would have to flip in Hebrew (§4.3) — but ‹ and › are bidi-MIRRORED
        characters: the browser already flips them inside an RTL paragraph, so
        writing the flipped one flips it twice and both arrows end up pointing
        the same way. The icons come with the design pass, as SVG, where the
        flip is ours to control.
      */}
      <footer className="nav">
        <button type="button" onClick={() => go(-1)} disabled={position <= 0}>
          {t('common.back')}
        </button>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={position >= steps.length - 1 || !canAdvance(step, state)}
        >
          {t('common.next')}
        </button>
      </footer>

      {/*
        Rendered, not hidden, when publishing is blocked. A disabled button
        with no stated reason is the single most common way a form loses
        someone at the last step.
      */}
      <p className="publish-state">
        {canPublish(state) ? t('listing.publish') : t('editor.fixLater')}
      </p>
    </main>
  );
}

interface CategoryProps {
  chosen: EditorState['category'];
  onChoose: (category: NonNullable<EditorState['category']>) => void;
}

/**
 * The first question, and the one that decides the rest of the flow — a
 * vehicle gets a plate step and a property does not.
 *
 * The list comes from the schema registry rather than being written out here,
 * so a third category appears in this picker by existing.
 */
function CategoryStep({ chosen, onChoose }: CategoryProps) {
  return (
    <ul className="choices">
      {LISTING_CATEGORIES.map((category) => (
        <li key={category}>
          <button
            type="button"
            className={category === chosen ? 'choice chosen' : 'choice'}
            aria-pressed={category === chosen}
            onClick={() => onChoose(category)}
          >
            {schemaFor(category).label}
          </button>
        </li>
      ))}
    </ul>
  );
}
