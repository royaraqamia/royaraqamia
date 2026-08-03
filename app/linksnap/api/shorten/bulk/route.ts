import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/backend/transport/bearer-auth';
import { createBulkShortenService } from '@/backend/config/linksnap';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { bulkShortenRateLimitPolicy } from '@/backend/config/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول لاستخدام الاختصار بالجملة.' },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkRateLimitApi(bulkShortenRateLimitPolicy(user.id));
    if (rateLimitResponse) return rateLimitResponse;

    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { success: false, error: "يجب أن يحتوي الإدخال على مصفوفة من 'urls'." },
        { status: 400 }
      );
    }

    const bulkService = createBulkShortenService();

    const results = await bulkService.execute(urls, user.id);

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
