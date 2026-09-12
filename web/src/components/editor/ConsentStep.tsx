import { t } from '../../lib/i18n';

interface Props {
  /** ISO timestamp, or undefined when nobody has declared yet. */
  declaredAt: string | undefined;
  onDeclare: (declaredAt: string | undefined) => void;
}

/**
 * Owner consent — property's equivalent of the vehicle plate step's
 * ownership declaration, and the property-side fix for docs/OPPORTUNITIES.md
 * §1d: nothing previously stopped someone advertising a property that was
 * not theirs to list.
 *
 * A CHECKBOX IS NOT CONSENT ON ITS OWN, so what the seller's tap produces is
 * a timestamp, not a boolean — the same shape `plate.ts`'s
 * `DeclarationRecord` uses for the equivalent vehicle question. Unchecking
 * clears it back to undefined rather than keeping a stale timestamp around
 * for a box that is now empty.
 *
 * UNLIKE THE PLATE, this is not skippable: a property listing cannot publish
 * without it (editor.ts's `consentMissing` blocker), because there is no
 * narrower purpose to opt out of — this is the general declaration required
 * before advertising at all, not a precondition for one optional lookup.
 */
export function ConsentStep({ declaredAt, onDeclare }: Props) {
  const declared = declaredAt !== undefined;

  return (
    <>
      <p className="hint">{t('editor.consentHint')}</p>

      <div className="fact-row">
        {/*
          One hit target for the box and its label, same as the plate step's
          declaration — and the reason sits under it rather than in a
          tooltip, because it is a legal statement and not a detail.
        */}
        <label className="declare">
          <input
            type="checkbox"
            checked={declared}
            onChange={(event) =>
              onDeclare(event.target.checked ? new Date().toISOString() : undefined)
            }
          />
          <span>{t('editor.consentDeclare')}</span>
        </label>
        <p className="plate-note">{t('editor.consentDeclareWhy')}</p>
      </div>
    </>
  );
}
