import { getPublicSupabase } from '@/backend/transport/supabase/public';

interface AuthenticatedUser {
  id: string;
  email: string;
}

export async function getAuthenticatedUser(
  authorization: string | null
): Promise<AuthenticatedUser | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.substring(7);
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
