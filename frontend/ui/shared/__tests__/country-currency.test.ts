import { describe, expect, it } from 'vitest';

import { currencyFromCountry } from '../country-currency';

describe('currencyFromCountry', () => {
  it('maps supported countries to their quoted currency', () => {
    expect(currencyFromCountry('SY')).toBe('SYP');
    expect(currencyFromCountry('us')).toBe('USD');
    expect(currencyFromCountry('SA')).toBe('SAR');
    expect(currencyFromCountry('DE')).toBe('EUR');
    expect(currencyFromCountry('MA')).toBe('MAD');
  });

  it('follows shared currencies into their territories', () => {
    expect(currencyFromCountry('EH')).toBe('MAD');
    expect(currencyFromCountry('PR')).toBe('USD');
    expect(currencyFromCountry('GP')).toBe('EUR');
  });

  it('returns null for countries without a quoted currency', () => {
    expect(currencyFromCountry('TR')).toBeNull();
    expect(currencyFromCountry('GB')).toBeNull();
    expect(currencyFromCountry('ZZ')).toBeNull();
    expect(currencyFromCountry(null)).toBeNull();
    expect(currencyFromCountry(undefined)).toBeNull();
  });
});
