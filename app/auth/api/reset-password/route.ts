import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createAuthService } from '@/backend/config/auth';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import type { SimpleResult } from '@/backend/services/auth/auth-service';

async function createService() {
  return createAuthService(createSupabaseAuthGateway(await createClient(), getAdminSupabase()));
}

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createService();
  const result: SimpleResult = await authService.resetPassword({
    email: body.email ?? '',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message ?? '' });
}
