import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { recordAppFailure } from '@/backend/controllers/app-failures';

/**
 * The app's own failure report (#667). Never cached and never read: the answer
 * only tells the app its report was accepted, and the app does not await it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await recordAppFailure(body, getClientIp(req)));
}
