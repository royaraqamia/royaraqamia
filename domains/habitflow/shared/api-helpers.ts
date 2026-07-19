import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { AppError, getErrorMessage } from './errors';

export interface AuthenticatedUser {
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

export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const userId = req.headers.get('x-user-id');
  const userEmail = req.headers.get('x-user-email');

  if (userId) {
    return { id: userId, email: userEmail ?? undefined };
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token) {
      try {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return null;
        const rawClient = createSupabaseClient(url, key, { auth: { persistSession: false } });
        const { data } = await rawClient.auth.getUser(token);
        if (data?.user) {
          return { id: data.user.id, email: data.user.email ?? undefined };
        }
      } catch {
        return null;
      }
    }
  }

  try {
    const supabase = await createClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? undefined,
    };
  } catch {
    return null;
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
