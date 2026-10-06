import { describe, it, expect, vi } from 'vitest';
import {
  createLirascopeProvider,
  parseLirascopeQuote,
} from '@/backend/clients/rates/lirascope-market-provider';

const metaHtml =
  '<html><head><meta name="description" content="سعر الدولار الأمريكي (USD) مقابل الليرة السورية اليوم: 138.5 ليرة سورية. السعر في السوق السوداء" /></head></html>';

const bodyHtml =
  '<html><body><span class="scope-big nums" style="font-size:48px">139.25</span></body></html>';

describe('parseLirascopeQuote', () => {
  it('reads the headline price from the meta description', () => {
    expect(parseLirascopeQuote(metaHtml)).toEqual({ rate: 138.5, date: '' });
  });

  it('falls back to the rendered market figure', () => {
    expect(parseLirascopeQuote(bodyHtml)).toEqual({ rate: 139.25, date: '' });
  });

  it('returns null when no price is present', () => {
    expect(parseLirascopeQuote('<html><body>404</body></html>')).toBeNull();
  });
});

describe('createLirascopeProvider', () => {
  it('fetches the currency page and parses the quote', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => metaHtml,
    })) as unknown as typeof fetch;
    const provider = createLirascopeProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchQuote()).resolves.toEqual({ rate: 138.5, date: '' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/ar/currency/usd',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla') }),
      })
    );
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const provider = createLirascopeProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchQuote()).rejects.toThrow('503');
  });
});
