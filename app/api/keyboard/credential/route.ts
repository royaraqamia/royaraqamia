import { NextRequest } from 'next/server';

import { grantKeyboardRewrite } from '@/backend/controllers/keyboard-rewrite';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * Consent, on the signed-in web session only (ADR-0220 decision 4).
 *
 * This route mints a short-lived rewrite credential; it never returns the
 * session cookie or a refresh token. The IME receives it through the local
 * bridge from the page and stores it in Keystore-backed app-private storage.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await grantKeyboardRewrite(body, req.headers));
}
