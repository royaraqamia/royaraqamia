import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveSession = vi.fn();
const mockResolveAdmin = vi.fn();
const mockGetAuthenticatedUser = vi.fn();
const mockCaptureException = vi.fn();

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: () => mockResolveSession(),
    bearer: (authorization) => mockGetAuthenticatedUser(authorization),
    admin: () => mockResolveAdmin(),
  });
});

vi.mock('@sentry/nextjs', () => ({
  captureException: (error: unknown) => mockCaptureException(error),
}));

import {
  forbidden,
  handleAuthenticated,
  messageError,
  unauthenticated,
} from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { withBearerUser } from '@/backend/transport/bearer-handler';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult } from '@/backend/transport/http-result';
import { RepositoryError } from '@/backend/shared/repository-error';

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

  it('maps an unauthenticated outcome to the default 401 body', async () => {
    const run = vi.fn();
    const result = await handleAuthenticated(async () => unauthenticated(), run);

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(run).not.toHaveBeenCalled();
  });

  it('maps a forbidden outcome to the default 403 body without string matching', async () => {
    const run = vi.fn();
    const result = await handleAuthenticated(async () => forbidden(), run);

    expect(result).toEqual(expect.objectContaining({ status: 403, body: { error: 'غير مصرح' } }));
    expect(run).not.toHaveBeenCalled();
  });

  it('lets the policy distinguish unauthenticated from forbidden', async () => {
    const policy = {
      whenUnauthenticated: () => jsonResult(401, { error: 'سجّل الدخول' }),
      whenForbidden: () => jsonResult(403, { error: 'لست مشرفاً' }),
    };

    const signedOut = await handleAuthenticated(
      async () => unauthenticated(),
      async () => jsonResult(200, {}),
      policy
    );
    const nonAdmin = await handleAuthenticated(
      async () => forbidden(),
      async () => jsonResult(200, {}),
      policy
    );

    expect(signedOut).toEqual(
      expect.objectContaining({ status: 401, body: { error: 'سجّل الدخول' } })
    );
    expect(nonAdmin).toEqual(
      expect.objectContaining({ status: 403, body: { error: 'لست مشرفاً' } })
    );
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

  it('maps a repository failure to a retryable 500, not the domain policy status', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async () => {
        throw new RepositoryError('createExpense', new Error('connection reset'));
      },
      { mapError: messageError(400, 'فشل') }
    );

    // Data-access failures stay retryable so an Offline Sync replay backs off
    // instead of being marked permanently failed (ADR-0029).
    expect(result).toMatchObject({ status: 500 });
    // Already logged/reported at the repository seam — not captured twice.
    expect(mockCaptureException).not.toHaveBeenCalled();
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

describe('account-scoped cache posture', () => {
  it('marks a successful authenticated read no-store', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async () => jsonResult(200, { bookmarks: [] })
    );

    expect(result).toMatchObject({ headers: { 'Cache-Control': 'no-store' } });
  });

  it('marks the signed-out 401 no-store, so the refusal is not replayed', async () => {
    const result = await handleAuthenticated(
      async () => null,
      async () => jsonResult(200, {})
    );

    expect(result).toMatchObject({ status: 401, headers: { 'Cache-Control': 'no-store' } });
  });

  it('does not let a handler re-enable caching on an account-scoped response', async () => {
    const result = await handleAuthenticated(
      async () => ({ userId: 'u-1' }),
      async () => jsonResult(200, {}, { headers: { 'Cache-Control': 'public, max-age=60' } })
    );

    expect(result).toMatchObject({ headers: { 'Cache-Control': 'no-store' } });
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
    const result = messageError(500, 'فشل حفظ المنشور')('nope');
    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: { error: 'فشل حفظ المنشور' } })
    );
  });
});

describe('withAuthenticatedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the session identity through', async () => {
    mockResolveSession.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.com' },
      client: { from: vi.fn() },
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
    mockResolveSession.mockResolvedValue({ user: null, client: null });
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

describe('withAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAdmin.mockResolvedValue({
      kind: 'admin',
      identity: { user: { id: 'admin-1', email: 'admin@example.com' }, client: { from: vi.fn() } },
    });
  });

  it('passes the admin identity through', async () => {
    const result = await withAdminUser(async ({ userId, userEmail, supabase }) =>
      jsonResult(200, { userId, userEmail, hasClient: Boolean(supabase) })
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { userId: 'admin-1', userEmail: 'admin@example.com', hasClient: true },
      })
    );
  });

  it('returns 401 when the identity is anonymous, without querying', async () => {
    mockResolveAdmin.mockResolvedValue({ kind: 'anonymous' });
    const run = vi.fn();

    const result = await withAdminUser(run);

    expect(result).toEqual(
      expect.objectContaining({
        status: 401,
        body: { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' },
      })
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('returns 403 when the identity is forbidden, without querying', async () => {
    mockResolveAdmin.mockResolvedValue({ kind: 'forbidden' });
    const run = vi.fn();

    const result = await withAdminUser(run);

    expect(result).toEqual(
      expect.objectContaining({ status: 403, body: { success: false, error: 'غير مصرح' } })
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('lets the caller map a domain error', async () => {
    const result = await withAdminUser(
      async () => {
        throw new Error('بيانات غير صالحة');
      },
      { mapError: messageError(400, 'فشل') }
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 400, body: { error: 'بيانات غير صالحة' } })
    );
  });

  it('owns the default 500 body', async () => {
    const result = await withAdminUser(async () => {
      throw new Error('boom');
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 500,
        body: { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' },
      })
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
