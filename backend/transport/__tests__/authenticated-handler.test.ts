import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockGetAuthenticatedUser = vi.fn();
const mockCaptureException = vi.fn();

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: () => mockGetAuthUser(),
}));

vi.mock('@/backend/middleware/bearer-auth', () => ({
  getAuthenticatedUser: (authorization: string | null) => mockGetAuthenticatedUser(authorization),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (error: unknown) => mockCaptureException(error),
}));

import { handleAuthenticated, messageError } from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { withBearerUser } from '@/backend/transport/bearer-handler';
import { jsonResult } from '@/backend/transport/http-result';

describe('handleAuthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the handler with the identity the guard produced', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async (identity) => jsonResult(200, { id: identity.userId })
    );

    expect(result).toEqual(expect.objectContaining({ status: 200, body: { id: 'u-1' } }));
  });

  it('returns a 401 body when the guard yields no identity', async () => {
    const run = vi.fn();
    const result = await handleAuthenticated(async () => null, run);

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(run).not.toHaveBeenCalled();
  });

  it('prefers the policy response when unauthenticated', async () => {
    const result = await handleAuthenticated(
      async () => null,
      async () => jsonResult(200, {}),
      {
        whenUnauthenticated: () => jsonResult(200, { notifications: [] }),
      }
    );

    expect(result).toEqual(expect.objectContaining({ status: 200, body: { notifications: [] } }));
  });

  it('maps a thrown error through the policy', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async () => {
        throw new Error('مبلغ غير صالح');
      },
      { mapError: messageError(400, 'فشل') }
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 400, body: { error: 'مبلغ غير صالح' } })
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('falls through to a 500 with the failure body when the policy declines', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async () => {
        throw new Error('boom');
      },
      { mapError: () => null }
    );

    expect(result).toMatchObject({ status: 500 });
    expect(result).toEqual(
      expect.objectContaining({
        body: { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' },
      })
    );
  });

  it('uses a custom failure body when supplied', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async () => {
        throw new Error('boom');
      },
      { whenFailed: { error: 'فشل إنشاء المصروف' } }
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: { error: 'فشل إنشاء المصروف' } })
    );
  });

  it('captures a guard failure and answers 500', async () => {
    const result = await handleAuthenticated(
      async () => {
        throw new Error('cookies unavailable');
      },
      async () => jsonResult(200, {})
    );

    expect(result).toMatchObject({ status: 500 });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('does not let the domain error policy swallow a guard failure', async () => {
    const mapError = vi.fn(() => jsonResult(400, { error: 'wrong' }));

    const result = await handleAuthenticated(
      async () => {
        throw new Error('cookies unavailable');
      },
      async () => jsonResult(200, {}),
      { mapError }
    );

    expect(result).toMatchObject({ status: 500 });
    expect(mapError).not.toHaveBeenCalled();
  });
});

describe('messageError', () => {
  it('uses the error message', () => {
    const result = messageError(400, 'فشل')(new Error('تصنيف مطلوب'));
    expect(result).toEqual(
      expect.objectContaining({ status: 400, body: { error: 'تصنيف مطلوب' } })
    );
  });

  it('falls back for a non-error', () => {
    const result = messageError(500, 'فشل حفظ المقال')('nope');
    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: { error: 'فشل حفظ المقال' } })
    );
  });
});

describe('withAuthenticatedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the session identity through', async () => {
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.com' },
      supabase: { from: vi.fn() },
    });

    const result = await withAuthenticatedUser(async ({ userId, userEmail, supabase }) =>
      jsonResult(200, { userId, userEmail, hasClient: Boolean(supabase) })
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { userId: 'u-1', userEmail: 'a@b.com', hasClient: true },
      })
    );
  });

  it('returns 401 when the session has no user', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
    const run = vi.fn();

    const result = await withAuthenticatedUser(run);

    expect(result).toMatchObject({ status: 401 });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('withBearerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the bearer identity through', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-2', email: 'c@d.com' });

    const result = await withBearerUser('Bearer token', async ({ userId, userEmail }) =>
      jsonResult(200, { userId, userEmail })
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 200, body: { userId: 'u-2', userEmail: 'c@d.com' } })
    );
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith('Bearer token');
  });

  it('returns the policy 401 body when the token is absent', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const run = vi.fn();

    const result = await withBearerUser(null, run, {
      whenUnauthenticated: () => jsonResult(401, { success: false, error: 'غير مصرح.' }),
    });

    expect(result).toEqual(
      expect.objectContaining({ status: 401, body: { success: false, error: 'غير مصرح.' } })
    );
    expect(run).not.toHaveBeenCalled();
  });
});
