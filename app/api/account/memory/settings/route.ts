import { NextRequest } from 'next/server';

import { saveAgentMemorySettings } from '@/backend/controllers/account-memory';
import { toNextResponse } from '@/backend/transport/http-result';

/** `PATCH /api/account/memory/settings`: the per-scope switches (#1428). */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await saveAgentMemorySettings(body, req.headers));
}
