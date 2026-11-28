import { NextRequest } from 'next/server';

import { runVisualRenders } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The motion worker's doorbell (ADR-0215 amendment). `CRON_SECRET` authorises
 * it, like every sweep; `wake_visual_renders()` is what calls it.
 *
 * The render is frame-to-MP4 work, so the runtime is Node and the ceiling is
 * raised: one bounded clip fits well under it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return toNextResponse(await runVisualRenders(req.headers));
}
