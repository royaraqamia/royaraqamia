import { NextResponse } from 'next/server';
import { createServerAuthService } from '@/backend/config/auth';

export async function POST() {
  try {
    const service = await createServerAuthService();
    await service.logout();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تسجيل الخروج' },
      { status: 500 }
    );
  }
}
