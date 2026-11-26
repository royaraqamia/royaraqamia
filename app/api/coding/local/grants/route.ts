import { NextRequest } from 'next/server';

import { listCodingLocalGrants } from '@/backend/controllers/coding';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The member's paired devices, newest first. No token or path is in the DTO. */
export async function GET(req: NextRequest) {
  return toNextResponse(await listCodingLocalGrants(req.headers));
}
