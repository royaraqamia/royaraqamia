import { NextRequest } from 'next/server';

import { listCodingRepos } from '@/backend/controllers/coding';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Repositories the member's GitHub App installation can reach, for the picker. */
export async function GET(req: NextRequest) {
  return toNextResponse(await listCodingRepos(req.headers));
}
