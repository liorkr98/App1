import { useState } from 'react';

import { attachLookup, formatPlateForInput, normalisePlate } from '@/features/listings/plate';
import type { Fact } from '@/types/listing';

import { t } from '../../lib/i18n';
import { lookupPlate } from '../../lib/plate-lookup';

interface Props {
  /** Digits only, no separators. Empty until the seller types something. */
  plate: string;
  onPlate: (plate: string) => void;
  declared: boolean;
  onDeclare: (declared: boolean) => void;
  facts: readonly Fact[];
  onFacts: (facts: Fact[]) => void;
}

/**
 * The licence plate — a LOOKUP KEY, and nothing else.
 *
 * ======================== TWO RULES, BOTH ABSOLUTE ========================
 * CLAUDE.md §7 and §12.
 *
 * THE PLATE IS NEVER PUBLISHED. A public page pairing a plate with a location
 * is a theft and cloning risk, and this page is deliberately reachable by
 * anyone holding the link. It is enforced structurally rather than by care:
 * nothing in plate.ts returns the plate, there is no field on `Listing` to put
 * it in, and it is deliberately not written into the saved draft either. The
 * only way to publish one would be to add somewhere to store it.
 *
 * AN OWNERSHIP DECLARATION IS REQUIRED before a lookup may be attached, and it
 * is logged. `attachLookup` takes it as an argument rather than checking a
 * flag somewhere, so it cannot be forgotten — the type system refuses before
 * the runtime does.
 * ==========================================================================
 *
 * The step is skippable. The registry fills eight of the twelve vehicle fields
 * and the other four are the seller's anyway, so a seller who does not want to
 * declare ownership can still type everything by hand.
 */
export function PlateStep({ plate, onPlate, declared, onDeclare, facts, onFacts }: Props) {
  const digits = plate.replace(/\D+/g, '');
  const valid = normalisePlate(digits) !== undefined;
  const showError = digits.length > 0 && !valid;
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState<'ok' | 'failed' | 'needDeclare' | null>(null);

  const runLookup = async () => {
    if (!declared) {
      setNote('needDeclare');
      return;
    }
    const normalised = normalisePlate(digits);
    if (!normalised) return;

    setLooking(true);
    setNote(null);
    const declaredAt = new Date().toISOString();
    const result = await lookupPlate({ plate: normalised, declaredAt });
    setLooking(false);

    if ('error' in result) {
      setNote('failed');
      return;
    }

    try {
      const attached = attachLookup(facts, result.values, declaredAt, {
        sourceName: 'משרד התחבורה',
        sourceDate: result.sourceDate || new Date().toISOString().slice(0, 7).split('-').reverse().join('/'),
      });
      onFacts(attached.facts);
      setNote('ok');
    } catch {
      setNote('failed');
    }
  };

  return (
    <>
      <p className="hint">{t('editor.plateHint')}</p>

      <div className="fact-row">
        <div className="fact-head">
          <label htmlFor="plate">{t('editor.plateLabel')}</label>
        </div>

        <input
          id="plate"
          name="plate"
          /*
           * inputMode numeric, not type="number". A plate is a string of
           * digits, not a quantity: a number input would offer a spinner,
           * accept a minus sign and an exponent, and drop a leading zero.
           */
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          maxLength={12}
          aria-invalid={showError}
          aria-describedby="plate-note"
          /* Grouped as the seller reads it back — 12-345-67 — while the value
             kept in state stays bare digits. */
          value={formatPlateForInput(digits)}
          onChange={(event) => onPlate(event.target.value.replace(/\D+/g, '').slice(0, 8))}
        />

        <p id="plate-note" className={showError ? 'plate-note bad' : 'plate-note'}>
          {showError ? t('editor.plateInvalid') : valid ? t('editor.plateOk') : t('editor.plateSkip')}
        </p>
      </div>

      <div className="fact-row">
        {/*
          A checkbox and its label share one hit target, so there is no dead
          zone between them — and the reason for the declaration sits under it
          rather than in a tooltip, because it is a legal statement and not a
          detail.
        */}
        <label className="declare">
          <input
            type="checkbox"
            checked={declared}
            onChange={(event) => onDeclare(event.target.checked)}
          />
          <span>{t('editor.plateDeclare')}</span>
        </label>
        <p className="plate-note">{t('editor.plateDeclareWhy')}</p>
      </div>

      <button
        type="button"
        className="disclosures-add"
        disabled={!valid || looking}
        onClick={() => void runLookup()}
      >
        {looking ? t('editor.plateLooking') : t('editor.plateLookup')}
      </button>

      {note === 'ok' ? <p className="plate-note">{t('editor.plateLookupOk')}</p> : null}
      {note === 'failed' ? <p className="plate-note bad">{t('editor.plateLookupFailed')}</p> : null}
      {note === 'needDeclare' ? (
        <p className="plate-note bad">{t('editor.plateLookupNeedDeclare')}</p>
      ) : null}
    </>
  );
}
