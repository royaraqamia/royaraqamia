import { describe, it, expect, vi } from 'vitest';
import {
  createCompositeVariantProvider,
  type RateVariantProvider,
} from '@/backend/clients/rates/variant-rate-provider';

function provider(
  name: string,
  fetchVariants: () => Promise<
    import('@/backend/clients/rates/variant-rate-provider').VariantQuote[]
  >
): RateVariantProvider {
  return { name, fetchVariants };
}

describe('createCompositeVariantProvider', () => {
  it('merges official and parallel values from multiple sources by code', async () => {
    const composite = createCompositeVariantProvider([
      provider('official', async () => [{ code: 'SYP', official: 122, date: '2026-10-05' }]),
      provider('market', async () => [
        { code: 'SYP', parallel: 138, date: '2026-10-05' },
        { code: 'IQD', official: 1310, parallel: 1596, date: '2026-10-05' },
      ]),
    ]);

    const result = await composite.fetchVariants();

    const syp = result.find((quote) => quote.code === 'SYP')!;
    expect(syp.official).toBe(122);
    expect(syp.parallel).toBe(138);
    expect(result.find((quote) => quote.code === 'IQD')?.parallel).toBe(1596);
  });

  it('carries per-market parallel values', async () => {
    const composite = createCompositeVariantProvider([
      provider('yemen', async () => [
        { code: 'YER', parallel: 531, markets: { sanaa: 531, aden: 1563 }, date: '' },
      ]),
    ]);

    const result = await composite.fetchVariants();

    expect(result[0]?.markets).toEqual({ sanaa: 531, aden: 1563 });
  });

  it('keeps the first source value when a later source also returns one', async () => {
    const composite = createCompositeVariantProvider([
      provider('primary', async () => [
        { code: 'SYP', official: 122, parallel: 138, date: '2026-10-05' },
      ]),
      provider('secondary', async () => [
        { code: 'SYP', official: 999, parallel: 1000, date: '2026-10-06' },
      ]),
    ]);

    const result = await composite.fetchVariants();

    expect(result[0]).toMatchObject({
      code: 'SYP',
      official: 122,
      parallel: 138,
      date: '2026-10-05',
    });
  });

  it('uses a later source value only when the first source omitted that field', async () => {
    const composite = createCompositeVariantProvider([
      provider('primary', async () => [{ code: 'IQD', official: 1310, date: '' }]),
      provider('secondary', async () => [
        { code: 'IQD', official: 999, parallel: 1596, date: '2026-10-06' },
      ]),
    ]);

    const result = await composite.fetchVariants();

    expect(result[0]).toMatchObject({
      code: 'IQD',
      official: 1310,
      parallel: 1596,
      date: '2026-10-06',
    });
  });

  it('keeps the first source value for a shared market and fills secondary-only markets', async () => {
    const composite = createCompositeVariantProvider([
      provider('primary', async () => [
        { code: 'YER', parallel: 531, markets: { sanaa: 531, aden: 1563 }, date: '' },
      ]),
      provider('secondary', async () => [
        { code: 'YER', parallel: 600, markets: { sanaa: 999, taiz: 700 }, date: '' },
      ]),
    ]);

    const result = await composite.fetchVariants();

    expect(result[0]?.markets).toEqual({ sanaa: 531, aden: 1563, taiz: 700 });
  });

  it('drops a failing source and reports it without losing the others', async () => {
    const onFallback = vi.fn();
    const composite = createCompositeVariantProvider(
      [
        provider('good', async () => [{ code: 'DZD', official: 133, date: '' }]),
        provider('bad', async () => {
          throw new Error('down');
        }),
      ],
      { onFallback }
    );

    const result = await composite.fetchVariants();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ code: 'DZD', official: 133 });
    expect(onFallback).toHaveBeenCalledWith('bad', expect.any(Error));
  });
});
