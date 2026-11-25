import { NextRequest } from 'next/server';

import { rewriteKeyboardText } from '@/backend/controllers/keyboard-rewrite';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The keyboard's only network action (ADR-0220 decision 2).
 *
 * No session cookie is read here. The request must carry the scoped IME
 * credential in `Authorization: Bearer` and the current composing text as its
 * whole body; the controller caps both sides, spends the member's allowance and
 * releases it if the one provider call fails.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await rewriteKeyboardText(body, req.headers.get('authorization')));
}
