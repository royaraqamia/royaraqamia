import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/domains/linksnap/lib/auth-helper';
import { SupabaseShortLinkRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-short-link.repository';
import { BulkShortenUseCase } from '@/domains/linksnap/application/services/bulk-shorten.usecase';
import { checkRateLimitApi } from '@/domains/linksnap/lib/with-rate-limit';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول لاستخدام الاختصار بالجملة.' },
        { status: 401 }
      );
    }

    const rateLimitResponse = checkRateLimitApi({
      key: `bulk-shorten:${user.id}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message:
        'تم تجاوز حد الطلب: طلبات الاختصار بالجملة محدودة بـ 10 دفعات كل 10 دقائق لحماية سلامة قاعدة البيانات.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { success: false, error: "يجب أن يحتوي الإدخال على مصفوفة من 'urls'." },
        { status: 400 }
      );
    }

    const shortLinkRepo = new SupabaseShortLinkRepository();
    const bulkUseCase = new BulkShortenUseCase(shortLinkRepo);

    const results = await bulkUseCase.execute(urls, user.id);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (err: unknown) {
    console.error('Error in bulk shortening endpoint:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الاختصار بالجملة.',
      },
      { status: 500 }
    );
  }
}
