import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/domains/linksnap/lib/auth-helper';
import { SupabaseShortLinkRepository } from '@/domains/linksnap/infrastructure/repositories/supabase-short-link.repository';
import { ListLinksUseCase } from '@/domains/linksnap/application/services/list-links.usecase';
import { UpdateLinkUseCase } from '@/domains/linksnap/application/services/update-link.usecase';
import { DeleteLinkUseCase } from '@/domains/linksnap/application/services/delete-link.usecase';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const repository = new SupabaseShortLinkRepository();
    const useCase = new ListLinksUseCase(repository);

    const links = await useCase.execute(user.id);

    return NextResponse.json({
      success: true,
      links: links.map((l) => ({
        code: l.code,
        originalUrl: l.originalUrl,
        createdAt: l.createdAt.toISOString(),
        isBlocked: l.isBlocked,
      })),
    });
  } catch (err: unknown) {
    console.error('Error in list links API route:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const { code, originalUrl } = await req.json();

    if (!code || !originalUrl) {
      return NextResponse.json(
        { success: false, error: "كل من 'code' و 'originalUrl' مطلوبان." },
        { status: 400 }
      );
    }

    const repository = new SupabaseShortLinkRepository();
    const useCase = new UpdateLinkUseCase(repository);

    const updatedLink = await useCase.execute(code, user.id, originalUrl);

    return NextResponse.json({
      success: true,
      link: {
        code: updatedLink.code,
        originalUrl: updatedLink.originalUrl,
        createdAt: updatedLink.createdAt.toISOString(),
        isBlocked: updatedLink.isBlocked,
      },
    });
  } catch (err: unknown) {
    console.error('Error in update link API route:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

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

    const repository = new SupabaseShortLinkRepository();
    const useCase = new DeleteLinkUseCase(repository);
    await useCase.execute(code, user.id);

    return NextResponse.json({
      success: true,
      message: 'تم حذف الرابط بنجاح.',
    });
  } catch (err: unknown) {
    console.error('Error in delete link API route:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.' },
      { status: 500 }
    );
  }
}
