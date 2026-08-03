import { NextResponse } from 'next/server';
import { createServerAuthService } from '@/backend/config/auth';
import type { OAuthResult } from '@/backend/services/auth/auth-service';

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createServerAuthService();
  const result: OAuthResult = await authService.signInWithOAuth(
    'google',
    body.redirectTo ?? undefined
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ url: result.url });
}
