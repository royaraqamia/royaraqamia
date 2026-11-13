import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { createDownloadJob } from '@/backend/controllers/downloader';
import { stampVisitorCookie, visitorKeyFor } from '@/backend/middleware/visitor-cookie';

/**
 * The dispatch runs in `after()`, so the route must outlive the provider's
 * acknowledgement window (see CobaltMediaProvider's timeout) to tolerate a host
 * that cold starts.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // The counted action mints the visitor id it counts against: the middleware no
  // longer stamps it on documents, because a response that sets a cookie is
  // never cached at the edge (ADR-0176). A `POST` is not cached, so this is the
  // one place it is free.
  const visitor = visitorKeyFor(req);
  const response = toNextResponse(await createDownloadJob(body, getClientIp(req), visitor.key));

  return visitor.minted ? stampVisitorCookie(response, visitor.key) : response;
}
