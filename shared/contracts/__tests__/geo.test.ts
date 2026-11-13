import { describe, it, expect } from 'vitest';
import { GEO_HEADERS, isoFromGeoHeaders } from '@/shared/contracts/geo';

const headersOf = (map: Record<string, string>) => (name: string) => map[name];

describe('the platform geo header', () => {
  it('reads Cloudflare first and upper-cases the answer', () => {
    expect(isoFromGeoHeaders(headersOf({ 'cf-ipcountry': 'sy' }))).toBe('SY');
  });

  it('still answers the host the site used to run on', () => {
    expect(isoFromGeoHeaders(headersOf({ 'x-vercel-ip-country': 'DE' }))).toBe('DE');
  });

  it('prefers the current host when both are present', () => {
    expect(
      isoFromGeoHeaders(headersOf({ 'cf-ipcountry': 'SY', 'x-vercel-ip-country': 'DE' }))
    ).toBe('SY');
  });

  it('refuses anything that is not an ISO country, rather than passing it on', () => {
    // `T1` is Cloudflare's Tor marker; `XX` is its unlocatable one and is left to
    // fall through downstream, where `getCountryByIso` refuses it like any other
    // code this app does not carry.
    for (const value of ['T1', '', 'SYR', 'S']) {
      expect(isoFromGeoHeaders(headersOf({ 'cf-ipcountry': value }))).toBeNull();
    }
  });

  it('declares both names once', () => {
    expect(GEO_HEADERS).toEqual(['cf-ipcountry', 'x-vercel-ip-country']);
  });
});
