import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/backend/transport/auth-helper';
import { createGetUrlAnalyticsService } from '@/backend/config/linksnap';

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;

    if (!code) {
      return NextResponse.json({ success: false, error: 'رمز الرابط مطلوب.' }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const service = createGetUrlAnalyticsService();

    const analytics = await service.execute(code, user.id);

    return NextResponse.json({
      success: true,
      analytics,
    });
  } catch (err: unknown) {
    console.error('Error in link analytics API route:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.' },
      { status: 500 }
    );
  }
}
