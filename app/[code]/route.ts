import { NextRequest, NextResponse } from 'next/server';
import { SupabaseShortLinkRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-short-link.repository';
import { SupabaseAnalyticsRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-analytics.repository';
import { RedirectUrlUseCase } from '@/domains/linksnap/application/services/redirect-url.usecase';

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  if (code.startsWith('_') || code.includes('.') || code === 'api' || code === 'favicon.ico') {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const shortLinkRepo = new SupabaseShortLinkRepository();
    const analyticsRepo = new SupabaseAnalyticsRepository();
    const useCase = new RedirectUrlUseCase(shortLinkRepo, analyticsRepo);

    const referrer = req.headers.get('referer') || null;
    const userAgent = req.headers.get('user-agent') || null;
    const ipCountry =
      req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry') || null;

    const originalUrl = await useCase.execute(code, {
      referrer,
      userAgent,
      ipCountry,
    });

    return NextResponse.redirect(originalUrl, 302);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Redirect failed for code [${code}]:`, errorMessage);

    const baseUrl = process.env.APP_URL || new URL(req.url).origin;
    const errorCode = errorMessage.includes('deactivated') ? 'blocked' : 'not-found';
    return NextResponse.redirect(`${baseUrl}/linksnap?error=${errorCode}&code=${code}`, 302);
  }
}
