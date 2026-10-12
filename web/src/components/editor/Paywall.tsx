import { useEffect, useRef, useState } from 'react';

import { offeredPlan, planByKey, priceParts, type CohortCount } from '@/features/billing/price';
import { PRICING, type PlanKey } from '@/features/billing/pricing-config';

import { recordBillingEvent } from '../../lib/billing-events';
import { t } from '../../lib/i18n';
import { readCounts } from '../../lib/launch-offer';
import { Message } from './Message';

interface Props {
  category: 'property' | 'vehicle' | undefined;
}

/**
 * The paywall, when the two free pages are in use (docs/PRICING.md §2).
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8: this may be built, and it decides nothing. It is shown
 * because the database refused (or would refuse) the publish; choosing a
 * plan here grants nothing, and checkout stays disabled until an Israeli
 * PSP is signed. The launch plan is preselected only while a real seat
 * remains; otherwise the regular plan is.
 * ======================================================================
 */
export function Paywall({ category }: Props) {
  const [counts, setCounts] = useState<CohortCount[] | null>(null);
  const launchKey: PlanKey = category === 'vehicle' ? 'dealer_launch' : 'agent_launch';
  const offered = offeredPlan(launchKey, counts).plan.key;
  const options: PlanKey[] =
    category === 'vehicle' ? [offered, 'agent', 'private_car'] : [offered, 'office', 'private_sale', 'private_rent'];
  const [chosen, setChosen] = useState<PlanKey | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    let live = true;
    void readCounts().then((rows) => {
      if (live) setCounts(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    void recordBillingEvent('paywall_shown', launchKey);
  }, [launchKey]);

  const selected = chosen ?? offered;

  return (
    <div className="paywall" role="region" aria-labelledby="paywall-title">
      <h3 id="paywall-title">
        <Message path="billing.paywall.title" values={{ pages: PRICING.freePageLimit }} />
      </h3>
      <p>{t('billing.paywall.body')}</p>

      <ul className="paywall-plans">
        {options.map((key) => {
          const plan = planByKey(key);
          const parts = priceParts(plan);
          return (
            <li key={key}>
              <label className={key === selected ? 'paywall-plan is-selected' : 'paywall-plan'}>
                <input
                  type="radio"
                  name="paywall-plan"
                  checked={key === selected}
                  onChange={() => {
                    setChosen(key);
                    void recordBillingEvent('plan_selected', key);
                  }}
                />
                <span className="paywall-name">
                  {t(`billing.plans.${key}`)}
                  {plan.cohort ? <span className="paywall-flag">{t('billing.launchFlag')}</span> : null}
                </span>
                <span className="paywall-price">
                  <Message path={`billing.terms.${parts.terms}`} values={{ price: parts.amount }} />
                </span>
                <span className="paywall-note">
                  <Message
                    path={`billing.notes.${key}`}
                    values={{
                      pages: PRICING.freePageLimit,
                      months: PRICING.lockMonths,
                      annual: plan.annualMonths ?? 0,
                      seats: plan.seats ?? 0,
                      days: plan.pageTtlDays ?? 0,
                    }}
                  />
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {planByKey(selected).audience === 'agent' || planByKey(selected).audience === 'office' ? (
        <p className="field-hint">{t('billing.paywall.licence')}</p>
      ) : null}

      <button type="button" className="secondary" disabled>
        {t('pricing.disabled')}
      </button>
      <p className="field-hint">
        {t('pricing.checkoutOff')} <a href="/contact/">{t('pricing.contact')}</a>
      </p>
      <p className="field-hint">{t('billing.paywall.archive')}</p>
    </div>
  );
}
