import { headers } from 'next/headers';
import { isoFromGeoHeaders } from '@/shared/contracts/geo';

/**
 * The country the platform resolved for this request, or null when it supplied
 * none (local development, or an address it cannot place).
 *
 * Reading `headers()` opts the calling page into dynamic rendering, which is the
 * point rather than a cost: the value is per-request, so the document that
 * embeds it is not one a shared cache may keep (ADR-0176). The form pages that
 * need it are the four this is called from.
 */
export async function geoCountry(): Promise<string | null> {
  const requestHeaders = await headers();
  return isoFromGeoHeaders((name) => requestHeaders.get(name));
}
