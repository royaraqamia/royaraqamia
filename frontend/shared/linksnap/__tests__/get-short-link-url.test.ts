import { describe, it, expect } from 'vitest';
import { getShortLinkUrl } from '@/frontend/shared/linksnap/get-short-link-url';

describe('getShortLinkUrl', () => {
  it('builds a short link URL from base url and code', () => {
    expect(getShortLinkUrl('https://royaraqamia.com', 'abc123')).toBe(
      'https://royaraqamia.com/abc123'
    );
  });

  it('strips trailing slashes from the base url', () => {
    expect(getShortLinkUrl('https://royaraqamia.com/', 'xyz')).toBe('https://royaraqamia.com/xyz');
  });

  it('preserves nested codes exactly', () => {
    expect(getShortLinkUrl('https://royaraqamia.com', 'my/promo-link')).toBe(
      'https://royaraqamia.com/my/promo-link'
    );
  });
});
