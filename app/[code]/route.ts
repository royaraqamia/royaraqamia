import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { redirectShortCode } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const headers = req.headers;
  const ipCountry = headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || null;

  return toNextResponse(
    await redirectShortCode(code, {
      referrer: headers.get('referer') || null,
      userAgent: headers.get('user-agent') || null,
      ipCountry,
      origin: new URL(req.url).origin,
    })
  );
}
