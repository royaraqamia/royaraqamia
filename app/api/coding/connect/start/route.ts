import { NextRequest } from 'next/server';

import { startCodingConnectHandler } from '@/backend/controllers/coding';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers)) {
    return toNextResponse(jsonResult(403, { success: false, error: 'طلب غير مسموح' }));
  }
  return toNextResponse(await startCodingConnectHandler(req.headers));
}
