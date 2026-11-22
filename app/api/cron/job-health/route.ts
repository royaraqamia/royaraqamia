import { NextRequest } from 'next/server';

import { checkScheduledJobHealth } from '@/backend/controllers/job-health';
import { toNextResponse } from '@/backend/transport/http-result';

/** The database scheduler's heartbeat, authorised like every other sweep. */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return toNextResponse(await checkScheduledJobHealth(req.headers));
}
