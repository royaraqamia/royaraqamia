import { NextRequest } from 'next/server';

import { revokeCodingLocalGrant } from '@/backend/controllers/coding';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Revocation is immediate: active tasks on that device fail on their next poll. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req.headers)) {
    return toNextResponse(jsonResult(403, { success: false, error: 'طلب غير مسموح' }));
  }
  const { id } = await context.params;
  return toNextResponse(await revokeCodingLocalGrant(req.headers, id));
}
