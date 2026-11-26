import { NextRequest } from 'next/server';

import { createCodingLocalPair } from '@/backend/controllers/coding';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { CreateCodingLocalPairSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A member creates the one-time code their companion will trade for a grant. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers)) {
    return toNextResponse(jsonResult(403, { success: false, error: 'طلب غير مسموح' }));
  }
  const parsed = CreateCodingLocalPairSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await createCodingLocalPair(req.headers, parsed.data));
}
