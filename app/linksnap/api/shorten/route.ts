import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/domains/linksnap/lib/auth-helper';
import { SupabaseShortLinkRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-short-link.repository';
import { ShortenUrlUseCase } from '@/domains/linksnap/application/services/shorten-url.usecase';
import { checkRateLimitApi } from '@/domains/linksnap/lib/with-rate-limit';
import { getClientIp } from '@/domains/linksnap/lib/request-utils';
import { getErrorMessage } from '@/domains/linksnap/lib/error-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalUrl, customCode } = body;

    const user = await getAuthenticatedUser(req);
    const userId = user ? user.id : null;

    const ip = getClientIp(req);
    const rateLimitKey = `shorten:${userId || ip}`;
    const limit = userId ? 50 : 5;
    const message = userId
      ? 'تم تجاوز حد الطلب: الحسابات الموثقة محدودة بـ 50 رابطًا كل 10 دقائق لمنع إساءة استخدام النظام.'
      : 'تم تجاوز حد الطلب: إنشاء الروابط للمستخدمين المجهولين محدود بـ 5 روابط كل 10 دقائق. يرجى تسجيل الدخول أو إنشاء حساب للحدود الأعلى.';
    const rateLimitResponse = checkRateLimitApi({
      key: rateLimitKey,
      limit,
      windowMs: 10 * 60 * 1000,
      message,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const repository = new SupabaseShortLinkRepository();
    const useCase = new ShortenUrlUseCase(repository);

    const newLink = await useCase.execute(originalUrl, userId, customCode);

    return NextResponse.json({
      success: true,
      link: {
        code: newLink.code,
        originalUrl: newLink.originalUrl,
        createdAt: newLink.createdAt.toISOString(),
        userId: newLink.userId,
      },
    });
  } catch (err: unknown) {
    console.error('Error in shorten API route:', err);
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 400 });
  }
}
