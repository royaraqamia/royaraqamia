import { METAL_CODES, type MetalCode } from '@/shared/contracts/rates';
import { fetchJson, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';

export interface MetalPrice {
  code: MetalCode;
  pricePerOunceUsd: number;
  updatedAt: string;
}

export interface MetalPricesResult {
  prices: MetalPrice[];
}

export interface MetalPriceProvider {
  fetchPrices(): Promise<MetalPricesResult>;
}

interface GoldApiRow {
  symbol: string;
  price: number;
  updatedAt: string;
}

const DEFAULT_BASE_URL = 'https://api.gold-api.com';

export interface GoldApiProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

export function createGoldApiProvider(options: GoldApiProviderOptions = {}): MetalPriceProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async fetchPrices(): Promise<MetalPricesResult> {
      const rows = await Promise.all(
        METAL_CODES.map((code) => fetchJson<GoldApiRow>(`${baseUrl}/price/${code}`, options))
      );

      const prices = rows
        .filter((row) => Number.isFinite(row.price) && row.price > 0)
        .map((row) => ({
          code: row.symbol as MetalCode,
          pricePerOunceUsd: row.price,
          updatedAt: row.updatedAt,
        }));

      return { prices };
    },
  };
}
