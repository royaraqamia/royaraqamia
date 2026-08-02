import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/backend/transport/auth-helper';
import { createShortenUrlService } from '@/backend/config/linksnap';
import { checkRateLimitApi } from '@/backend/shared/with-rate-limit';
import { getClientIp } from '@/backend/shared/request-utils';
import { getErrorMessage } from '@/backend/shared/error-utils';

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
    const rateLimitResponse = await checkRateLimitApi({
      key: rateLimitKey,
      limit,
      windowMs: 10 * 60 * 1000,
      message,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const service = createShortenUrlService();

    const newLink = await service.execute(originalUrl, userId, customCode);

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
