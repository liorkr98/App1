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
import { LISTING_CATEGORIES, schemaFor } from '@/features/listings/schemas';

import { t } from '../../lib/i18n';
import { Message } from './Message';

/**
 * The editor island (Stage E).
 *
 * All the rules live in @/features/listings/editor — what blocks publishing,
 * which steps a category has, where a returning seller lands. This file is
 * the presentation of those rules and holds no product logic of its own, so
 * the answer to "why can I not publish" is testable without a browser.
 *
 * NOT YET WIRED, and deliberately so — this commit exists to prove the React
 * toolchain builds in CI, which nothing here can check locally:
 *   - photos, facts, description, template and preview render their heading
 *     and nothing else
 *   - there is no persistence; a refresh loses the draft
 *   - publish is inert. It is gated on entitlement and no provider is chosen
 *
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

  const go = (delta: number) => {
    const target = steps[position + delta];
    if (target) setStep(target);
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
          <CategoryStep
            chosen={state.category}
            onChoose={(category) => setState((current) => ({ ...current, category }))}
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
