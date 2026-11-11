import { NextRequest, after } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { unlockLinkPassword } from '@/backend/controllers/linksnap';
import { getClientIp } from '@/backend/transport/http';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(
    await unlockLinkPassword(
      getClientIp(req),
      body,
      // The unlock is where a protected link's click actually lands, so its
      // click write and owner notification get the same `after()` treatment as
      // the redirect route; a bare promise can be cut when the response is sent.
      (promise) => after(() => promise)
    )
  );
}
