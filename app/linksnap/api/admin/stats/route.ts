import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/backend/transport/bearer-auth';
import { createGetSystemStatsService } from '@/backend/config/linksnap';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const service = createGetSystemStatsService();
    const stats = await service.execute(user.email);

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
