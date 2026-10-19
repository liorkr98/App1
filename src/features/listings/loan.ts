/**
 * The repayment a buyer would make on a loan for this listing (19 Oct 2026):
 * a mortgage for a flat, a car loan for a car. Shown only when the agent
 * turned the calculator on (extras.calculator, 0047), and always as an
 * illustration: the buyer types the rate and the term, nothing is fetched,
 * and no figure here is an offer of credit or a valuation (CLAUDE.md §7).
 */

export interface LoanDefaults {
  /** Share of the price paid up front, percent. */
  downPercent: number;
  /** Example annual rate, percent. The buyer changes it. */
  ratePercent: number;
  years: number;
  maxYears: number;
}

/**
 * Starting points, not advice. A flat starts at 25% down because the Bank of
 * Israel caps a first-home mortgage at 75% of the price; a car at 20%.
 */
export const LOAN_DEFAULTS: Record<'property' | 'vehicle', LoanDefaults> = {
  property: { downPercent: 25, ratePercent: 5, years: 25, maxYears: 30 },
  vehicle: { downPercent: 20, ratePercent: 7, years: 5, maxYears: 7 },
};

/**
 * The fixed monthly payment that repays `principal` over `months` at
 * `annualRatePercent` (the standard annuity, שפיצר). Zero rate repays in
 * equal parts. Undefined for anything that is not a real loan.
 */
export function monthlyPayment(principal: number, annualRatePercent: number, months: number): number | undefined {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRatePercent) || !Number.isInteger(months)) return undefined;
  if (principal <= 0 || months <= 0 || annualRatePercent < 0 || annualRatePercent > 30) return undefined;
  const rate = annualRatePercent / 100 / 12;
  if (rate === 0) return principal / months;
  return (principal * rate) / (1 - (1 + rate) ** -months);
}

/** The payment for a price, a down payment in percent, a rate and years, rounded to the shekel. */
export function loanFor(price: number, downPercent: number, ratePercent: number, years: number): number | undefined {
  if (!Number.isFinite(downPercent) || downPercent < 0 || downPercent >= 100) return undefined;
  const payment = monthlyPayment(price * (1 - downPercent / 100), ratePercent, Math.round(years * 12));
  return payment === undefined ? undefined : Math.round(payment);
}
