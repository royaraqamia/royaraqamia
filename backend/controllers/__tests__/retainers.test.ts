import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmit = vi.fn();
const mockList = vi.fn();
const mockUpdate = vi.fn();
const mockGetOptionalUser = vi.fn();
const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/admin-allowlist', () => ({
  syncAdminAllowlistMirror: (emails: string[]) => mockSyncAdminAllowlistMirror(emails),
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: null, client: null }),
    optional: () => mockGetOptionalUser(),
    admin: async () => {
      const { user, client } = await mockGetAuthUser();
      if (!user) return { kind: 'anonymous' };
      if (user.email !== 'admin@example.com') return { kind: 'forbidden' };
      await mockSyncAdminAllowlistMirror(['admin@example.com']);
      return { kind: 'admin', identity: { user, client } };
    },
  });
});

vi.mock('@/backend/config/retainers', () => ({
  createDefaultRetainerService: () => ({
    submit: mockSubmit,
    list: mockList,
    update: mockUpdate,
  }),
}));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getOptionalUser: () => mockGetOptionalUser(),
}));

import { listRetainers, submitRetainer, updateRetainer } from '@/backend/controllers/retainers';
import {
  RetainerNotFoundError,
  RetainerRateLimitError,
} from '@/backend/services/retainers/retainers-service';

const VALID_BODY = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  current_projects: 'متجر إلكترونيّ على ووردبريس، وموقع تعريفيّ لشركة صغيرة.',
  needs: 'صيانة دوريَّة، إصلاح الأعطال، وإضافة ميزات جديدة كلَّ شهر.',
};

const RETAINER = { id: 'ret-1', reference_code: 'RET-2026-A7K2M9QX' };

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@example.com' }, client: {} };
const NON_ADMIN_SESSION = { user: { id: 'user-2', email: 'user@example.com' }, client: {} };
const SIGNED_OUT = { user: null, client: {} };

describe('retainers controller: submitRetainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalUser.mockResolvedValue({ user: null, client: null });
    mockSubmit.mockResolvedValue(RETAINER);
  });

  it('rejects an invalid body with field errors and never calls the service', async () => {
    const result = await submitRetainer({ ...VALID_BODY, phone_whatsapp: 'nope' }, '1.1.1.1');

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, fieldErrors: { phone_whatsapp: 'رقم واتساب غير صحيح' } },
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('returns the reference code on success', async () => {
    const result = await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, referenceCode: 'RET-2026-A7K2M9QX' },
    });
  });

  it('attributes an anonymous submission to no user', async () => {
    await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: null });
  });

  it('attributes a signed-in submission to the session user', async () => {
    mockGetOptionalUser.mockResolvedValue({ user: { id: 'user-9' }, client: {} });

    await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: 'user-9' });
  });

  it('maps a rate limit rejection to 429', async () => {
    mockSubmit.mockRejectedValue(new RetainerRateLimitError());

    const result = await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 429, body: { success: false } });
  });

  it('maps an unexpected failure to 500 without leaking the cause', async () => {
    mockSubmit.mockRejectedValue(new Error('connection reset by peer'));

    const result = await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 500 });
    expect(JSON.stringify(result)).not.toContain('connection reset');
  });
});

describe('retainers controller: listRetainers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
    mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
    mockList.mockResolvedValue({ data: [RETAINER], total: 1 });
  });

  it('returns rows for an admin', async () => {
    const result = await listRetainers(1, 20);

    expect(result).toMatchObject({ status: 200, body: { total: 1 } });
    expect(mockSyncAdminAllowlistMirror).toHaveBeenCalledWith(['admin@example.com']);
  });

  it('answers 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await listRetainers(1, 20);

    expect(result).toMatchObject({ status: 401 });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin without querying', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await listRetainers(1, 20);

    expect(result).toMatchObject({ status: 403, body: { success: false, error: 'غير مصرح' } });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('passes a known status filter through', async () => {
    await listRetainers(1, 20, 'active');

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('drops an unknown status filter instead of failing', async () => {
    await listRetainers(1, 20, 'archived');

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('passes a trimmed search term through and drops a blank one', async () => {
    await listRetainers(1, 20, null, '  RET-2026  ');
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ search: 'RET-2026' }));

    await listRetainers(1, 20, null, '   ');
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined }));
  });

  it('clamps a hostile page size', async () => {
    await listRetainers(1, 100000);

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  it('answers a readable 500 on a genuine failure', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listRetainers(1, 20);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تحميل العقود.' },
    });
  });
});

describe('retainers controller: updateRetainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
    mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(RETAINER);
  });

  it('answers 401 when signed out before validating the body and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await updateRetainer('ret-1', { status: 'archived' });

    expect(result).toMatchObject({ status: 401 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin without querying', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await updateRetainer('ret-1', { status: 'active' });

    expect(result).toMatchObject({ status: 403 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown status', async () => {
    const result = await updateRetainer('ret-1', { status: 'archived' });

    expect(result).toMatchObject({ status: 400, body: { success: false } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects a fee the column could not store exactly', async () => {
    const result = await updateRetainer('ret-1', { status: 'active', monthly_fee_usd: 100.999 });

    expect(result).toMatchObject({ status: 400, body: { success: false } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('accepts a details-only edit that carries no status', async () => {
    const result = await updateRetainer('ret-1', { monthly_fee_usd: 250 });

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockUpdate).toHaveBeenCalledWith('ret-1', { monthly_fee_usd: 250 });
  });

  it('returns the updated row and carries the agreed terms through', async () => {
    const result = await updateRetainer('ret-1', {
      status: 'active',
      monthly_fee_usd: 250,
      paid_through: '2026-10-01',
    });

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockUpdate).toHaveBeenCalledWith('ret-1', {
      status: 'active',
      monthly_fee_usd: 250,
      paid_through: '2026-10-01',
    });
  });

  it('maps a missing retainer to 404', async () => {
    mockUpdate.mockRejectedValue(new RetainerNotFoundError());

    const result = await updateRetainer('missing', { status: 'active' });

    expect(result).toMatchObject({ status: 404, body: { success: false } });
  });

  it('answers a readable 500 on a genuine failure', async () => {
    mockUpdate.mockRejectedValue(new Error('db down'));

    const result = await updateRetainer('ret-1', { status: 'active' });

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذّر تحديث العقد.' },
    });
  });
});
