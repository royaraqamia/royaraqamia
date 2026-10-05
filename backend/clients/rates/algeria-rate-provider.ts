import { fetchJson, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';
import type {
  RateVariantProvider,
  VariantQuote,
} from '@/backend/clients/rates/variant-rate-provider';

/**
 * Bank of Algeria's site is not machine-readable, so squarealgerie.com is used
 * as a keyless JSON proxy: `/api/rates/official` mirrors the official rate and
 * `/api/rates` carries the parallel ("Square Port-Saïd") market rate.
 */
const DEFAULT_BASE_URL = 'https://squarealgerie.com';

export interface AlgeriaRateProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUsdRate(payload: unknown): { rate: number; date: string } | null {
  if (!isRecord(payload) || !Array.isArray(payload.currencies)) return null;
  const usd = payload.currencies.find(
    (entry): entry is Record<string, unknown> => isRecord(entry) && entry.code === 'USD'
  );
  if (!usd) return null;
  const raw = usd.buy ?? usd.sell;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  const date = typeof payload.updatedAt === 'string' ? payload.updatedAt.slice(0, 10) : '';
  return { rate: raw, date };
}

export function parseAlgeriaOfficialRate(payload: unknown): number | null {
  return parseUsdRate(payload)?.rate ?? null;
}

export function parseAlgeriaParallelRate(payload: unknown): number | null {
  return parseUsdRate(payload)?.rate ?? null;
}

export function createAlgeriaRateProvider(
  options: AlgeriaRateProviderOptions = {}
): RateVariantProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: 'squarealgerie',
    async fetchVariants(): Promise<VariantQuote[]> {
      const [officialPayload, parallelPayload] = await Promise.all([
        fetchJson<unknown>(`${baseUrl}/api/rates/official`, options),
        fetchJson<unknown>(`${baseUrl}/api/rates`, options),
      ]);

      const official = parseAlgeriaOfficialRate(officialPayload);
      const parallel = parseAlgeriaParallelRate(parallelPayload);
      if (official === null && parallel === null) return [];

      const date = parseUsdRate(officialPayload)?.date ?? parseUsdRate(parallelPayload)?.date ?? '';
      return [
        {
          code: 'DZD',
          official: official ?? undefined,
          parallel: parallel ?? undefined,
          date,
        },
      ];
    },
  };
}
