import { NextRequest } from 'next/server';

import { finishCodingConnect } from '@/backend/controllers/coding';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GitHub redirects the member's own browser here; the answer is always a 303.
 * 'Cache-Control': 'no-store' — the query carries a one-time state and code.
 */
export async function GET(req: NextRequest) {
  return toNextResponse(await finishCodingConnect(req.nextUrl.searchParams));
}
