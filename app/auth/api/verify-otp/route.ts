import { NextResponse } from 'next/server';
import { createServerAuthService } from '@/backend/config/auth';
import type { VerifyOtpResult } from '@/backend/services/auth/auth-service';

export async function POST(req: Request) {
  const body = await req.json();
  const email = body.email ?? '';
  const otp = body.otp ?? '';
  const redirectTo = body.redirectTo ?? null;

  const authService = await createServerAuthService();
  const result: VerifyOtpResult = await authService.verifyOtp({
    email,
    otp,
    redirectTo,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, redirectTo: result.redirectUrl });
}
