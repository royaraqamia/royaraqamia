import { NextRequest } from 'next/server';

import { claimCodingLocalTask } from '@/backend/controllers/coding';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The companion's poll for work. The grant bearer is the only credential, and
 * the answer is one task spec whose callback token is minted here, not stored
 * in plaintext anywhere.
 */
export async function POST(req: NextRequest) {
  return toNextResponse(await claimCodingLocalTask(req.headers));
}
