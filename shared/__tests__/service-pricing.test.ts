import { describe, expect, it } from 'vitest';
import {
  PRO_SERVICE_DISCOUNT_PERCENT,
  isProSubscriber,
  subscriberPriceUsd,
} from '../service-pricing';

describe('subscriberPriceUsd', () => {
  it('takes the advertised percentage off every quoted service price', () => {
    expect(PRO_SERVICE_DISCOUNT_PERCENT).toBe(20);
    expect(subscriberPriceUsd(50)).toBe(40); // training
    expect(subscriberPriceUsd(25)).toBe(20); // consultations
    expect(subscriberPriceUsd(300)).toBe(240); // website
    expect(subscriberPriceUsd(600)).toBe(480); // app
    expect(subscriberPriceUsd(150)).toBe(120); // retainer
  });

  it('rounds a package price that does not divide evenly to the nearest dollar', () => {
    expect(subscriberPriceUsd(27.5)).toBe(22);
    expect(subscriberPriceUsd(27.1)).toBe(22);
    expect(subscriberPriceUsd(26.2)).toBe(21);
  });
});

describe('isProSubscriber', () => {
  it('is true for an active paid plan and for an unlimited Admin', () => {
    expect(isProSubscriber('pro')).toBe(true);
    expect(isProSubscriber('free', true)).toBe(true);
  });

  it('is false for a free plan, a lapsed plan and a guest', () => {
    expect(isProSubscriber('free')).toBe(false);
    expect(isProSubscriber(null)).toBe(false);
    expect(isProSubscriber(undefined)).toBe(false);
  });
});
