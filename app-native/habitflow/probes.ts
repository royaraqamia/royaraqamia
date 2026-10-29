'use client';

/**
 * The credential half of the spike, measured instead of assumed.
 *
 * These are the calls the veto table's "session continuity" row needs: a token
 * minted in the bundled origin, sent to the live server, and answered. Both
 * probed endpoints now resolve a Bearer token (issue #501):
 *
 *   * `/linksnap/api/links` has always accepted one (`withSessionOrBearerUser`).
 *   * `/habitflow/api/habits` used to resolve the session cookie only, so the
 *     same token was answered 401. Its handlers now run through the
 *     request-aware identity seam and a client scoped to the caller's token.
 *
 * `authorizedRequest` uses `CapacitorHttp` rather than `fetch` because native
 * HTTP has no CORS gate, and re-authenticates at most once if either endpoint
 * rejects an expired token.
 */

import { authorizedRequest } from './session';

export interface Probe {
  path: string;
  /** What the row is there to show. */
  note: string;
}

export const PROBES: Probe[] = [
  {
    path: '/linksnap/api/links',
    note: 'يقرأ رمز Bearer اليوم (withSessionOrBearerUser)',
  },
  {
    path: '/habitflow/api/habits',
    note: 'يقرأ الرمز والعميل الخاص به بعد #501',
  },
];

export interface ProbeResult {
  path: string;
  /** HTTP status, or a transport failure the panel prints verbatim. */
  status: number | string;
  detail: string;
}

function excerpt(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 120);
  if (data === null || data === undefined) return '';
  try {
    return JSON.stringify(data).slice(0, 120);
  } catch {
    return String(data);
  }
}

/** Run every probe with the current Bearer token. */
export async function runProbes(): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    try {
      const response = await authorizedRequest(probe.path);
      results.push({
        path: probe.path,
        status: response.status,
        detail: excerpt(response.data),
      });
    } catch (error) {
      results.push({
        path: probe.path,
        status: 'فشل النقل',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
