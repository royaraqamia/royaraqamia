import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import type { PendingLoginStore } from '@/backend/shared/auth/pending-login-store';
import { env } from '@/backend/config/env';

const PENDING_LOGIN_COOKIE = 'pending_login_token';
const PENDING_LOGIN_TTL_SECONDS = 5 * 60;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// The pending password used to complete a login after OTP verification must be
// readable by ANY server instance (serverless deployments spin up fresh
// processes per request), so it cannot live in an in-memory Map. We instead
// encrypt it into the httpOnly cookie itself, making the store stateless.
function getEncryptionKey(): Buffer {
  const secret = env.pendingLoginSecret ?? env.supabaseServiceRoleKey ?? '';
  return createHash('sha256').update(`royaraqamia:pending-login:${secret}`).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decrypt(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function createServerPendingLoginStore(): PendingLoginStore {
  return {
    async readPassword(): Promise<string | null> {
      const cookieStore = await cookies();
      const tokenCookie = cookieStore.get(PENDING_LOGIN_COOKIE);
      if (!tokenCookie) return null;

      const decoded = decrypt(tokenCookie.value);
      if (!decoded) return null;
      try {
        const entry = JSON.parse(decoded) as { password?: string; exp?: number };
        if (!entry.password || typeof entry.exp !== 'number' || Date.now() > entry.exp) {
          return null;
        }
        return entry.password;
      } catch {
        return null;
      }
    },

    async setPassword(password: string): Promise<void> {
      const payload = JSON.stringify({
        password,
        exp: Date.now() + PENDING_LOGIN_TTL_SECONDS * 1000,
      });

      const cookieStore = await cookies();
      cookieStore.set(PENDING_LOGIN_COOKIE, encrypt(payload), {
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
