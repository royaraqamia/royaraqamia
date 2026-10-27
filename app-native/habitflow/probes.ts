'use client';

/**
 * The credential half of the spike, measured instead of assumed.
 *
 * These are the calls the veto table's "session continuity" row needs: a token
 * minted in the bundled origin, sent to the live server, and answered. Two
 * endpoints are probed on purpose, because they sit on opposite sides of the
 * seam that #501 exists to close:
 *
 *   * `/linksnap/api/links` already resolves a Bearer token
 *     (`withSessionOrBearerUser`), so it answers 200 and proves the token is
 *     real and the server accepts it from a bundled origin.
 *   * `/habitflow/api/habits` resolves the session cookie only
 *     (`withAuthenticatedUser`), so the same token is answered 401 — which is
 *     the finding: owned data needs a token-scoped client on the server, not
 *     just a header the route reads.
 *
 * `CapacitorHttp` is used rather than `fetch` because native HTTP has no CORS
 * gate: the probe measures the *server's* answer, not the preflight. Plain
 * `fetch` from `https://localhost` is the other half of that finding.
 */

import { CapacitorHttp } from '@capacitor/core';

import { REMOTE_ORIGIN } from './crossing';
import { accessToken } from './session';

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
    note: 'يقرأ الجلسة من الكوكي فقط (withAuthenticatedUser)',
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
  const token = await accessToken();
  if (!token) {
    return PROBES.map((probe) => ({
      path: probe.path,
      status: 'لا يوجد رمز',
      detail: 'سجّل الدخول أولاً',
    }));
  }

  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    try {
      const response = await CapacitorHttp.get({
        url: `${REMOTE_ORIGIN}${probe.path}`,
        headers: { Authorization: `Bearer ${token}` },
      });
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
