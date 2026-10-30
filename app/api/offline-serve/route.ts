import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { recordOfflineServe } from '@/backend/controllers/offline-metrics';

/**
 * The service worker's offline-miss beacon (ADR-0074). It is never cached and
 * never read: the answer only tells a maintainer's log query that the worker
 * reported, and the worker deliberately does not await it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await recordOfflineServe(body, getClientIp(req)));
}
