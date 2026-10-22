import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { recordAppPerf } from '@/backend/controllers/app-perf';

/**
 * The client's launch and tap beacon (#487). It is never cached and never read:
 * the answer only tells a maintainer's log query that the record was accepted,
 * and the client deliberately does not await it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await recordAppPerf(body, getClientIp(req)));
}
