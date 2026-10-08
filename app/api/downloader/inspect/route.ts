import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { inspectDownloadLink } from '@/backend/controllers/downloader';

/**
 * A probe really runs the extractor on the host, so this route shares the create
 * route's ceiling to tolerate a cold-starting host.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await inspectDownloadLink(body, getClientIp(req)));
}
