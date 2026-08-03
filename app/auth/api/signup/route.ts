import { NextResponse } from 'next/server';
import { createServerAuthService } from '@/backend/config/auth';
import type { SignupResult } from '@/backend/services/auth/auth-service';

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createServerAuthService();
  const result: SignupResult = await authService.signup({
    name: body.name ?? '',
    email: body.email ?? '',
    password: body.password ?? '',
    redirectTo: body.redirectTo ?? null,
    turnstileToken: body.turnstileToken ?? '',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
