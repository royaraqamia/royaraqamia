import { NextRequest } from 'next/server';

import { getRunnerTask } from '@/backend/controllers/coding';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** No session: the task-scoped bearer in Authorization is the only credential. */
export async function GET(req: NextRequest) {
  return toNextResponse(await getRunnerTask(req.headers));
}
