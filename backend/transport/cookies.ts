import { cookies } from 'next/headers';
import type { PendingLoginStore } from '@/backend/shared/auth/pending-login-store';

const PENDING_LOGIN_COOKIE = 'pending_login';
const PENDING_LOGIN_TTL_SECONDS = 5 * 60;

export function createCookiePendingLoginStore(): PendingLoginStore {
  return {
    async readPassword(): Promise<string | null> {
      const cookieStore = await cookies();
      const pending = cookieStore.get(PENDING_LOGIN_COOKIE);
      if (!pending) {
        return null;
      }
      try {
        const { password } = JSON.parse(pending.value) as { password?: string };
        return typeof password === 'string' ? password : null;
      } catch {
        return null;
      }
    },

    async setPassword(password: string): Promise<void> {
      const cookieStore = await cookies();
      cookieStore.set(PENDING_LOGIN_COOKIE, JSON.stringify({ password }), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: PENDING_LOGIN_TTL_SECONDS,
        path: '/',
      });
    },

    async clear(): Promise<void> {
      const cookieStore = await cookies();
      cookieStore.delete(PENDING_LOGIN_COOKIE);
    },
  };
}
