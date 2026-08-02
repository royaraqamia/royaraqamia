import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createAuthService } from '@/backend/config/auth';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import type { VerifyOtpResult } from '@/backend/services/auth/auth-service';

async function createService() {
  return createAuthService(createSupabaseAuthGateway(await createClient(), getAdminSupabase()));
}

export async function POST(req: Request) {
  const body = await req.json();
  const email = body.email ?? '';
  const otp = body.otp ?? '';
  const redirectTo = body.redirectTo ?? null;

  const cookieStore = await cookies();
  const pending = cookieStore.get('pending_login');

  let pendingPassword: string | null = null;
  if (pending) {
    try {
      const { password } = JSON.parse(pending.value);
      pendingPassword = typeof password === 'string' ? password : null;
    } catch {
      pendingPassword = null;
    }
  }

  const authService = await createService();
  const result: VerifyOtpResult = await authService.verifyOtp({
    email,
    otp,
    redirectTo,
    pendingPassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  if (result.consumedPendingLogin) {
    cookieStore.delete('pending_login');
  }

  return NextResponse.json({ success: true, redirectTo: result.redirectUrl });
}
