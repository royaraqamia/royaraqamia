import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createAuthService } from '@/backend/config/auth';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';

export async function POST() {
  try {
    const service = createAuthService(
      createSupabaseAuthGateway(await createClient(), getAdminSupabase())
    );
    await service.logout();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تسجيل الخروج' },
      { status: 500 }
    );
  }
}
