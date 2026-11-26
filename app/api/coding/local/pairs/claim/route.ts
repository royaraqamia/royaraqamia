import { NextRequest } from 'next/server';

import { claimCodingLocalPair } from '@/backend/controllers/coding';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { ClaimCodingLocalPairSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * No session and no same-origin check: the caller is the companion on the
 * member's device, and the one-time code in the body is the credential. Only
 * its digest is stored, and it is cleared the moment it is spent.
 */
export async function POST(req: NextRequest) {
  const parsed = ClaimCodingLocalPairSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await claimCodingLocalPair(req.headers, parsed.data));
}
