import { NextResponse } from 'next/server';
import { createServerAuthService } from '@/backend/config/auth';
import type { LoginResult } from '@/backend/services/auth/auth-service';

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createServerAuthService();
  const result: LoginResult = await authService.login({
    email: body.email ?? '',
    password: body.password ?? '',
    redirectTo: body.redirectTo ?? null,
    turnstileToken: body.turnstileToken ?? '',
  });

  if ('needsOtp' in result) {
    return NextResponse.json({ needsOtp: true, redirectUrl: result.redirectUrl });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
