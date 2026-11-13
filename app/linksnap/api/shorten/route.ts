import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { shortenUrl } from '@/backend/controllers/linksnap';
import { stampVisitorCookie, visitorKeyFor } from '@/backend/middleware/visitor-cookie';
import { getClientIp } from '@/backend/transport/http';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // The counted action mints the visitor id it counts against (ADR-0176): the
  // middleware stopped stamping it on documents because a response that sets a
  // cookie is never cached at the edge, and a `POST` is not cached at all.
  const visitor = visitorKeyFor(req);
  const response = toNextResponse(
    await shortenUrl(req.headers.get('Authorization'), getClientIp(req), body, visitor.key)
  );

  return visitor.minted ? stampVisitorCookie(response, visitor.key) : response;
}
