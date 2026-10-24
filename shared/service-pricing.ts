import type { PlanId } from './contracts/plans';

/**
 * The discount a paid-plan subscriber gets on the four services the site
 * quotes a price for: training, consultations, project builds and the monthly
 * retainer.
 *
 * The base prices are code constants next to their own contracts
 * (`TRAINING_COURSE`, `CONSULTATION_START_PRICE_USD`,
 * `PROJECT_REQUEST_*_START_PRICE_USD`, `RETAINER_DEFAULT_MONTHLY_FEE_USD`), so
 * the percentage that moves them lives here beside them rather than in
 * `plan_settings`: the catalog holds the plan's own price and allowances, and a
 * deploy is the right time to change a marketing discount.
 *
 * None of these services is paid on the site. The figure is a quote, and the
 * discount is what the subscriber is promised when the quote is agreed, so the
 * same constant drives every price the UI shows.
 */
export const PRO_SERVICE_DISCOUNT_PERCENT = 20;

/**
 * What a subscriber pays for a service listed at `amountUsd`.
 *
 * Rounded to the nearest whole dollar: every service price on the site is
 * quoted that way, and a package priced at $27.50 must not suddenly show cents
 * only to a subscriber.
 */
export function subscriberPriceUsd(amountUsd: number): number {
  return Math.round(amountUsd * (1 - PRO_SERVICE_DISCOUNT_PERCENT / 100));
}

/**
 * Whether an allowance carries the service discount. `unlimited` is the Admin
 * account, which gets everything a paid plan gets.
 */
export function isProSubscriber(plan: PlanId | null | undefined, unlimited = false): boolean {
  return unlimited || plan === 'pro';
}
