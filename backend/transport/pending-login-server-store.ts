import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import type { PendingLoginStore } from '@/backend/shared/auth/pending-login-store';

const PENDING_LOGIN_COOKIE = 'pending_login_token';
const PENDING_LOGIN_TTL_SECONDS = 5 * 60;

interface PendingEntry {
  password: string;
  expiresAt: number;
}

const store = new Map<string, PendingEntry>();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

export function createServerPendingLoginStore(): PendingLoginStore {
  return {
    async readPassword(): Promise<string | null> {
      evictExpired();
      const cookieStore = await cookies();
      const tokenCookie = cookieStore.get(PENDING_LOGIN_COOKIE);
      if (!tokenCookie) return null;

      const entry = store.get(tokenCookie.value);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(tokenCookie.value);
        return null;
      }
      return entry.password;
    },

    async setPassword(password: string): Promise<void> {
      evictExpired();
      const token = generateToken();
      store.set(token, {
        password,
        expiresAt: Date.now() + PENDING_LOGIN_TTL_SECONDS * 1000,
      });

      const cookieStore = await cookies();
      cookieStore.set(PENDING_LOGIN_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: PENDING_LOGIN_TTL_SECONDS,
        path: '/',
      });
    },

    async clear(): Promise<void> {
      const cookieStore = await cookies();
      const tokenCookie = cookieStore.get(PENDING_LOGIN_COOKIE);
      if (tokenCookie) {
        store.delete(tokenCookie.value);
      }
      cookieStore.delete(PENDING_LOGIN_COOKIE);
    },
  };
}
