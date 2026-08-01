import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/backend/transport/auth-helper';
import { GetSystemStatsUseCase } from '@/backend/usecases/linksnap/get-system-stats';
import { SupabaseAdminRepository } from '@/backend/repositories/linksnap/supabase-admin';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const repository = new SupabaseAdminRepository();
    const useCase = new GetSystemStatsUseCase(repository);
    const stats = await useCase.execute(user.email);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (err: unknown) {
    console.error('Error in administrative stats endpoint:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.' },
      { status: 500 }
    );
  }
}
