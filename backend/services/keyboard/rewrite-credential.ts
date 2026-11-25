import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/backend/config/env';
import { KEYBOARD_REWRITE_SCOPE } from '@/shared/contracts/keyboard-rewrite';

/**
 * The keyboard's narrow credential (ADR-0220 decision 5).
 *
 * It is an HMAC-signed, stateless claim: `sub` is the signed-in member, `scope`
 * is rewrite and nothing else, and `exp` is minutes away. The IME holds only
 * this string in Keystore-backed app-private storage; it never sees a Supabase
 * session cookie or refresh token, and the server never sees a token table.
 * Revocation deletes the only copy on the device, and the short TTL bounds any
 * copy that was extracted before the deletion.
 */
export const KEYBOARD_CREDENTIAL_TTL_SECONDS = 15 * 60;

const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Claims {
  v: number;
  sub: string;
  scope: string;
  iat: number;
  exp: number;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export interface KeyboardCredential {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: number;
}

/** Mint one rewrite-only credential, or `null` when no signing secret is configured. */
export function mintKeyboardCredential(
  userId: string,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000)
): KeyboardCredential | null {
  const secret = env.keyboardRewriteSecret;
  if (!secret) return null;
  const iat = nowSeconds();
  const payload = encode(
    JSON.stringify({
      v: VERSION,
      sub: userId,
      scope: KEYBOARD_REWRITE_SCOPE,
      iat,
      exp: iat + KEYBOARD_CREDENTIAL_TTL_SECONDS,
    } satisfies Claims)
  );
  const token = `${payload}.${sign(payload, secret)}`;
  return { token, userId, expiresAt: iat + KEYBOARD_CREDENTIAL_TTL_SECONDS };
}

/**
 * Verify the credential without contacting the identity provider. A token that
 * was minted for anything other than a rewrite is refused here, so a bearer
 * token from another surface can never be replayed into this endpoint.
 */
export function verifyKeyboardCredential(
  authorization: string | null,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000)
): KeyboardCredential | null {
  const secret = env.keyboardRewriteSecret;
  if (!secret) return null;
  const raw = authorization?.trim();
  if (!raw?.startsWith('Bearer ')) return null;
  const token = raw.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
  } catch {
    return null;
  }
  if (
    claims?.v !== VERSION ||
    claims.scope !== KEYBOARD_REWRITE_SCOPE ||
    typeof claims.sub !== 'string' ||
    !UUID.test(claims.sub) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= nowSeconds()
  ) {
    return null;
  }

  return { token, userId: claims.sub, expiresAt: claims.exp };
}
