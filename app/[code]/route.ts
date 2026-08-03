import { NextRequest, NextResponse } from 'next/server';
import { createRedirectUrlService } from '@/backend/config/linksnap';
import {
  isReservedShortCode,
  ShortLinkRedirectError,
} from '@/backend/services/linksnap/redirect-url';
import { env } from '@/backend/config/env';

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  if (isReservedShortCode(code)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const service = createRedirectUrlService();

    const referrer = req.headers.get('referer') || null;
    const userAgent = req.headers.get('user-agent') || null;
    const ipCountry =
      req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry') || null;

    const originalUrl = await service.execute(code, {
      referrer,
      userAgent,
      ipCountry,
    });

    return NextResponse.redirect(originalUrl, 302);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Redirect failed for code [${code}]:`, errorMessage);

    const baseUrl = env.appUrl || new URL(req.url).origin;
    const errorCode =
      err instanceof ShortLinkRedirectError && err.kind === 'blocked' ? 'blocked' : 'not-found';
    return NextResponse.redirect(`${baseUrl}/linksnap?error=${errorCode}&code=${code}`, 302);
  }
}
