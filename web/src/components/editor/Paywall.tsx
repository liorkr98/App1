import { useEffect, useRef, useState } from 'react';

import { offeredPlan, planByKey, priceParts, type CohortCount } from '@/features/billing/price';
import { PRICING, type PlanKey } from '@/features/billing/pricing-config';

import { recordBillingEvent } from '../../lib/billing-events';
import { checkoutOpen } from '../../lib/checkout-open';
import { t } from '../../lib/i18n';
import { readCounts } from '../../lib/launch-offer';
import { Message } from './Message';

interface Props {
  category: 'property' | 'vehicle' | undefined;
  /** A paid plan's active pages are all in use (plan_limit, 0045). */
  capped?: boolean;
}

/**
 * The paywall, when the two free pages are in use (docs/PRICING.md §2), or
 * when a paid plan's active pages are (capped): then it offers the plans
 * with more pages, and archiving one.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8: this may be built, and it decides nothing. It is shown
 * because the database refused (or would refuse) the publish; choosing a
 * plan here grants nothing. Paying opens /pay/ (Tranzila, 0049) only while
 * payments are switched on; otherwise the button stays disabled. The launch
 * plan is preselected only while a real seat remains; otherwise the
 * regular plan is.
 * ======================================================================
 */
export function Paywall({ category, capped = false }: Props) {
  const [counts, setCounts] = useState<CohortCount[] | null>(null);
  // One set of plans for agents and car dealers (18 Oct 2026).
  const launchKey: PlanKey = 'agent_launch';
  const offered = offeredPlan(launchKey, counts).plan.key;
  // Capped: whoever sees this is on 5 or 10 pages, so more pages is the
  // answer. Which plan they are on is not read here; the next tier up is
  // still the right list either way.
  const options: PlanKey[] = capped
    ? [offered, 'agent_unlimited', 'office']
    : category === 'vehicle'
      ? [offered, 'agent_basic', 'agent_unlimited', 'private_car']
      : [offered, 'agent_basic', 'agent_unlimited', 'private_sale', 'private_rent'];
  const [chosen, setChosen] = useState<PlanKey | null>(null);
  const [canPay, setCanPay] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    let live = true;
    void readCounts().then((rows) => {
      if (live) setCounts(rows);
    });
    void checkoutOpen().then((open) => {
      if (live) setCanPay(open);
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
        {capped ? t('billing.paywall.cappedTitle') : <Message path="billing.paywall.title" values={{ pages: PRICING.freePageLimit }} />}
      </h3>
      <p>{t(capped ? 'billing.paywall.cappedBody' : 'billing.paywall.body')}</p>

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
                      pages: plan.pageLimit ?? PRICING.freePageLimit,
                      free: PRICING.freePageLimit,
                      months: PRICING.lockMonths,
                      annual: plan.annualMonths ?? 0,
                      gift: plan.annualMonths ? 12 - plan.annualMonths : 0,
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

      {canPay ? (
        <a className="publish-button paywall-pay" href={`/pay/?plan=${selected}`}>
          {t('billing.pay')}
        </a>
      ) : (
        <>
          <button type="button" className="secondary" disabled>
            {t('pricing.disabled')}
          </button>
          <p className="field-hint">
            {t('pricing.checkoutOff')} <a href="/contact/">{t('pricing.contact')}</a>
          </p>
        </>
      )}
      <p className="field-hint">{t('billing.paywall.archive')}</p>
    </div>
  );
}
