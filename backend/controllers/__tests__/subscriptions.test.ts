import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmit = vi.fn();
const mockSessionUser = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: await mockSessionUser(), client: {} }),
  });
});

vi.mock('@/backend/config/subscriptions', () => ({
  createDefaultSubscriptionRequestService: () => ({ submit: mockSubmit }),
}));

import { submitSubscriptionRequest } from '@/backend/controllers/subscriptions';

const USER_ID = '11111111-1111-7111-8111-111111111111';
const OTHER_ID = '22222222-2222-7222-8222-222222222222';

const BODY = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963968478904',
};

function resultOf(result: Awaited<ReturnType<typeof submitSubscriptionRequest>>) {
  if ('redirect' in result) throw new Error('expected a JSON result');
  return { status: result.status, body: result.body as Record<string, unknown> };
}

describe('submitSubscriptionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionUser.mockResolvedValue({ id: USER_ID, email: 'member@example.com' });
    mockSubmit.mockResolvedValue({ reference_code: 'SUB-2026-A7K2M9QX' });
  });

  it('binds an account-less submission to the session, as before', async () => {
    const { status, body } = resultOf(await submitSubscriptionRequest(BODY));

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, referenceCode: 'SUB-2026-A7K2M9QX' });
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining(BODY), { userId: USER_ID });
  });

  it('accepts a replayed submission that names the signed-in account', async () => {
    const { status, body } = resultOf(
      await submitSubscriptionRequest({ ...BODY, user_id: USER_ID })
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, referenceCode: 'SUB-2026-A7K2M9QX' });
  });

  // #1084: a queue left behind by one member must never be written under the
  // next member's session. A 4xx here is what makes the Outbox fail it
  // permanently instead of retrying it against the wrong account.
  it('refuses a submission queued for another account', async () => {
    const { status, body } = resultOf(
      await submitSubscriptionRequest({ ...BODY, user_id: OTHER_ID })
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ success: false });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects a body with a malformed account id before any write', async () => {
    const { status } = resultOf(
      await submitSubscriptionRequest({ ...BODY, user_id: 'not-a-uuid' })
    );

    expect(status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('answers 401 for a visitor with no session', async () => {
    mockSessionUser.mockResolvedValue(null);

    const { status } = resultOf(await submitSubscriptionRequest(BODY));

    expect(status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
