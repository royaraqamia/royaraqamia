import { NextRequest, after } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { redirectShortCode } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const headers = req.headers;
  const ipCountry = headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || null;

  return toNextResponse(
    await redirectShortCode(
      code,
      {
        referrer: headers.get('referer') || null,
        userAgent: headers.get('user-agent') || null,
        ipCountry,
        origin: new URL(req.url).origin,
      },
      // The click write and the owner notification are off the redirect path.
      // `after()` keeps the instance alive until they settle; a bare
      // fire-and-forget promise can be cut off when the response is sent, which
      // silently loses click analytics.
      (promise) => after(() => promise)
    )
  );
}
