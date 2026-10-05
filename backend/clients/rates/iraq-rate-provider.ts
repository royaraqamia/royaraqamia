import { fetchJson, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';
import type {
  RateVariantProvider,
  VariantQuote,
} from '@/backend/clients/rates/variant-rate-provider';

/**
 * The Iraqi Dinar has a fixed Central Bank of Iraq rate (~1310) and a market
 * ("بورصة") rate that trades well above it. iraqprices.com publishes both in one
 * free, keyless JSON payload, sourced hourly from the `t.me/iqborsa` channel.
 */
const DEFAULT_BASE_URL = 'https://iraqprices.com';

export interface IraqRateProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseIraqRates(payload: unknown): VariantQuote | null {
  if (!isRecord(payload) || !isRecord(payload.dollar)) return null;
  const official = positive(payload.dollar.official);
  const parallel = positive(payload.dollar.parallel);
  if (official === undefined && parallel === undefined) return null;
  const date = typeof payload.updated === 'string' ? payload.updated.slice(0, 10) : '';
  return { code: 'IQD', official, parallel, date };
}

export function createIraqRateProvider(options: IraqRateProviderOptions = {}): RateVariantProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: 'iraqprices',
    async fetchVariants(): Promise<VariantQuote[]> {
      const payload = await fetchJson<unknown>(`${baseUrl}/api/prices`, options);
      const quote = parseIraqRates(payload);
      return quote ? [quote] : [];
    },
  };
}
