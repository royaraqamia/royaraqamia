import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/domains/linksnap/lib/auth-helper';
import { SupabaseShortLinkRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-short-link.repository';
import { ModerateLinkUseCase } from '@/domains/linksnap/application/services/moderate-link.usecase';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const { code, isBlocked } = await req.json();

    if (!code || typeof isBlocked !== 'boolean') {
      return NextResponse.json(
        { success: false, error: "كل من 'code' والقيمة المنطقية 'isBlocked' مطلوبان." },
        { status: 400 }
      );
    }

    const shortLinkRepo = new SupabaseShortLinkRepository();
    const useCase = new ModerateLinkUseCase(shortLinkRepo);
    const updatedLink = await useCase.execute(user.email, code, isBlocked);

    return NextResponse.json({
      success: true,
      message: `تم ${isBlocked ? 'حظر' : 'إلغاء حظر'} الرابط بنجاح.`,
      link: {
        code: updatedLink.code,
        originalUrl: updatedLink.originalUrl,
        isBlocked: updatedLink.isBlocked,
      },
    });
  } catch (err: unknown) {
    console.error('Error in administration moderation endpoint:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء المراقبة.',
      },
      { status: 500 }
    );
  }
}
