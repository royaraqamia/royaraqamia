import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KEYBOARD_REWRITE_COPY } from '@/backend/copy/keyboard-rewrite';
import type { HttpResult } from '@/backend/transport/http-result';
import { mintKeyboardCredential } from '@/backend/services/keyboard/rewrite-credential';
import {
  MAX_REWRITE_INPUT_CHARS,
  MAX_REWRITE_OUTPUT_CHARS,
} from '@/shared/contracts/keyboard-rewrite';

const USER = '11111111-2222-4333-8444-555555555555';
const REPLY = vi.fn();
const RECORD_USAGE = vi.fn();
const RELEASE_USAGE = vi.fn();
const RESOLVE_SESSION = vi.fn();

vi.mock('@/backend/clients/ai-chat', () => ({
  createAiChatClient: () => ({ reply: (...args: unknown[]) => REPLY(...args), model: 'test' }),
}));

vi.mock('@/backend/config/supabase', () => ({
  getAdminSupabase: () => ({
    rpc: (name: string, args: unknown) =>
      name === 'record_usage' ? RECORD_USAGE(args) : RELEASE_USAGE(args),
  }),
}));

vi.mock('@/backend/config/identity', () => ({
  identity: {
    resolveSession: () => RESOLVE_SESSION(),
    resolveBearer: vi.fn(),
  },
}));

import { grantKeyboardRewrite, rewriteKeyboardText } from '@/backend/controllers/keyboard-rewrite';

const HEADERS = new Headers({ 'sec-fetch-site': 'same-origin' });

function json(result: HttpResult) {
  if ('redirect' in result) throw new Error('a rewrite never redirects');
  return result;
}

function credential(): string {
  return `Bearer ${mintKeyboardCredential(USER)!.token}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KEYBOARD_REWRITE_SECRET', 'test-keyboard-secret');
  RESOLVE_SESSION.mockResolvedValue({
    user: { id: USER, email: 'member@example.com' },
    client: {},
  });
  REPLY.mockResolvedValue('نص أوضح.');
  RECORD_USAGE.mockResolvedValue({
    data: {
      allowed: true,
      duplicate: false,
      eventId: '22222222-3333-4444-8555-666666666666',
      counter: {
        key: 'keyboard.rewrite',
        label: 'إعادة صياغة من لوحة المفاتيح',
        window: 'daily',
        cap: 5,
        used: 1,
        remaining: 4,
      },
    },
    error: null,
  });
  RELEASE_USAGE.mockResolvedValue({ data: true, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/keyboard/credential', () => {
  it('mints a rewrite-only token only after explicit consent on a signed-in session', async () => {
    const res = json(await grantKeyboardRewrite({ consent: true }, HEADERS));
    const result = res.body as {
      success: boolean;
      token: string;
      scope: string;
      expiresIn: number;
    };

    expect(res.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.token).toContain('.');
    expect(result.scope).toBe('keyboard.rewrite');
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(RESOLVE_SESSION).toHaveBeenCalledTimes(1);
  });

  it('refuses a consent body that was never explicitly granted and a cross-origin post', async () => {
    const noConsent = await grantKeyboardRewrite({ consent: false }, HEADERS);
    expect(noConsent.status).toBe(400);

    const crossOrigin = await grantKeyboardRewrite(
      { consent: true },
      new Headers({ origin: 'https://elsewhere.example' })
    );
    expect(crossOrigin.status).toBe(403);
    expect(RECORD_USAGE).not.toHaveBeenCalled();
  });

  it('refuses to mint when no signing secret is configured', async () => {
    vi.stubEnv('KEYBOARD_REWRITE_SECRET', '');
    vi.stubEnv('MCP_TOKEN_ENCRYPTION_KEY', '');

    expect((await grantKeyboardRewrite({ consent: true }, HEADERS)).status).toBe(503);
  });
});

describe('POST /api/keyboard/rewrite', () => {
  it('accepts only the scoped credential, never the web session', async () => {
    const guest = await rewriteKeyboardText({ text: 'مرحبا' }, null);
    expect(guest.status).toBe(401);

    const cookieOnly = await rewriteKeyboardText({ text: 'مرحبا' }, 'sb-access-token=secret');
    expect(cookieOnly.status).toBe(401);

    const memberSession = await rewriteKeyboardText(
      { text: 'مرحبا' },
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'
    );
    expect(memberSession.status).toBe(401);
    expect(RESOLVE_SESSION).not.toHaveBeenCalled();
    expect(REPLY).not.toHaveBeenCalled();
  });

  it('caps the composing text before a counter is reserved', async () => {
    const result = await rewriteKeyboardText(
      { text: 'خ'.repeat(MAX_REWRITE_INPUT_CHARS + 1) },
      credential()
    );
    expect(result.status).toBe(400);
    expect(RECORD_USAGE).not.toHaveBeenCalled();
    expect(REPLY).not.toHaveBeenCalled();
  });

  it('caps the model answer and releases the count when it is too long', async () => {
    REPLY.mockResolvedValueOnce('خ'.repeat(MAX_REWRITE_OUTPUT_CHARS + 1));
    const result = await rewriteKeyboardText({ text: 'مرحبا' }, credential());

    expect(result.status).toBe(502);
    expect((json(result).body as { error?: string }).error).toBe(KEYBOARD_REWRITE_COPY.failure);
    expect(RECORD_USAGE).toHaveBeenCalledTimes(1);
    expect(RELEASE_USAGE).toHaveBeenCalledTimes(1);
  });

  it('releases the count on a provider failure and spends it on a success', async () => {
    REPLY.mockRejectedValueOnce(new Error('provider timeout'));
    const failed = await rewriteKeyboardText({ text: 'مرحبا' }, credential());
    expect(failed.status).toBe(502);
    expect(RELEASE_USAGE).toHaveBeenCalledTimes(1);

    const ok = await rewriteKeyboardText({ text: 'مرحبا' }, credential());
    expect(ok.status).toBe(200);
    expect((json(ok).body as { suggestion?: string }).suggestion).toBe('نص أوضح.');
    expect(RECORD_USAGE).toHaveBeenCalledTimes(2);
    expect(RELEASE_USAGE).toHaveBeenCalledTimes(1);
  });

  it('makes exactly one provider call with no tools and passes only the composing text', async () => {
    await rewriteKeyboardText({ text: 'النص الحالي فقط' }, credential());

    expect(REPLY).toHaveBeenCalledTimes(1);
    const [messages] = REPLY.mock.calls[0] as [Array<{ role: string; content: string }>];
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toBe('النص الحالي فقط');
    expect(JSON.stringify(REPLY.mock.calls[0])).not.toContain('tools');
  });
});
