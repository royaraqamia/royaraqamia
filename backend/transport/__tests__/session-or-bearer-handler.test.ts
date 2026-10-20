import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBearer = vi.fn();
const mockOptional = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: null, client: {} }),
    optional: () => mockOptional(),
    bearer: (authorization: string | null) => mockBearer(authorization),
  });
});

import { withSessionOrBearerUser } from '@/backend/transport/session-or-bearer-handler';

function ok() {
  return { status: 200, body: { success: true } };
}

describe('withSessionOrBearerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBearer.mockResolvedValue(null);
    mockOptional.mockResolvedValue({ user: null, client: null });
  });

  it('answers for the bearer identity when the request carries one', async () => {
    mockBearer.mockResolvedValue({ id: 'bearer-user', email: 'b@b.com' });
    mockOptional.mockResolvedValue({ user: { id: 'cookie-user' }, client: {} });

    const run = vi.fn(async () => ok());
    await withSessionOrBearerUser('Bearer token', run);

    expect(run).toHaveBeenCalledWith({ userId: 'bearer-user', userEmail: 'b@b.com' });
  });

  it('falls back to the session cookie when the token is absent or rejected', async () => {
    mockOptional.mockResolvedValue({ user: { id: 'cookie-user' }, client: {} });

    const run = vi.fn(async () => ok());
    await withSessionOrBearerUser(null, run);

    expect(run).toHaveBeenCalledWith({ userId: 'cookie-user', userEmail: '' });
  });

  it('maps no identity to the caller policy', async () => {
    const result = await withSessionOrBearerUser(null, async () => ok(), {
      whenUnauthenticated: () => ({ status: 401, body: { error: 'nope' } }),
    });

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'nope' } }));
  });
});
