import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { createDownloadJob } from '@/backend/controllers/downloader';

/**
 * The dispatch runs in `after()`, so the route must outlive the provider's
 * acknowledgement window (see CobaltMediaProvider's timeout) to tolerate a host
 * that cold starts.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await createDownloadJob(body, getClientIp(req)));
}
