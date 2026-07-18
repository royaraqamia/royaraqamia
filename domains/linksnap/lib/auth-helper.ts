import { NextRequest } from 'next/server';
import { getPublicSupabase } from '@/domains/linksnap/infrastructure/supabase/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  if (!token) {
    return null;
  }

  try {
    const supabase = getPublicSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email || '',
    };
  } catch (err) {
    console.error('Error authenticating token:', err);
    return null;
  }
}
