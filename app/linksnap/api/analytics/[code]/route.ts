import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/domains/linksnap/lib/auth-helper';
import { SupabaseAnalyticsRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-analytics.repository';
import { GetUrlAnalyticsUseCase } from '@/domains/linksnap/application/services/get-url-analytics.usecase';

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

    const repository = new SupabaseAnalyticsRepository();
    const useCase = new GetUrlAnalyticsUseCase(repository);

    const analytics = await useCase.execute(code, user.id);

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
