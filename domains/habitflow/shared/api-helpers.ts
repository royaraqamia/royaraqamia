import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { AppError, getErrorMessage } from './errors';

interface AuthenticatedUser {
  id: string;
  email?: string;
}

export async function getOptionalUser(): Promise<{
  user: AuthenticatedUser | null;
  client: SupabaseClient | null;
}> {
  try {
    const supabase = await createClient();
    if (!supabase) return { user: null, client: null };
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return { user: null, client: null };
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? undefined,
      },
      client: supabase,
    };
  } catch {
    return { user: null, client: null };
  }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, status?: number): NextResponse {
  const message = getErrorMessage(error);
  if (status === undefined && error instanceof AppError) {
    status = error.statusCode;
  }
  return NextResponse.json({ error: message }, { status: status ?? 500 });
}
