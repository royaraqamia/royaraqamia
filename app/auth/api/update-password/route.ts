import { NextResponse } from 'next/server';
import { safeRedirect } from '@/backend/shared/safe-redirect';
import { createServerAuthService } from '@/backend/config/auth';
import type { SimpleResult } from '@/backend/services/auth/auth-service';

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createServerAuthService();
  const result: SimpleResult = await authService.updatePassword({
    password: body.password ?? '',
    confirmPassword: body.confirmPassword ?? '',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ redirectUrl: safeRedirect(body.redirectTo ?? null) });
}
