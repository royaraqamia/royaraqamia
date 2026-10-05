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
