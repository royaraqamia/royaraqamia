import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();
const mockList = vi.fn();
const mockBroadcaster = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/admin-allowlist', () => ({
  syncAdminAllowlistMirror: (emails: string[]) => mockSyncAdminAllowlistMirror(emails),
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: null, client: null }),
    admin: async () => {
      const { user, client } = await mockGetAuthUser();
      if (!user) return { kind: 'anonymous' };
      if (user.email !== 'admin@example.com') return { kind: 'forbidden' };
      await mockSyncAdminAllowlistMirror(['admin@example.com']);
      return { kind: 'admin', identity: { user, client } };
    },
  });
});

vi.mock('@/backend/config/users', () => ({
  createAdminUsersService: () => ({ list: mockList }),
}));

vi.mock('@/backend/config/notifications', () => ({
  createAdminBroadcaster: () => mockBroadcaster,
  createSupabaseNotificationService: vi.fn(),
}));

import { listAdminUsers } from '@/backend/controllers/admin-users';
import { broadcastAnnouncement } from '@/backend/controllers/notifications';

const users = [{ id: 'u-1', name: 'أحمد محمد', email: 'ahmed@example.com', avatar_url: null }];

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@example.com' }, client: {} };
const NON_ADMIN_SESSION = { user: { id: 'user-2', email: 'user@example.com' }, client: {} };
const SIGNED_OUT = { user: null, client: {} };

async function readBody<T>(result: Awaited<ReturnType<typeof listAdminUsers>>): Promise<T> {
  if ('redirect' in result) {
    throw new Error('unexpected redirect');
  }
  return result.body as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
  mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
  mockList.mockResolvedValue(users);
  mockBroadcaster.mockResolvedValue(0);
});

describe('listAdminUsers', () => {
  it('answers 401 when signed out and never searches', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await listAdminUsers({ search: '' });

    expect(result.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockSyncAdminAllowlistMirror).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin and never searches', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await listAdminUsers({ search: '' });

    expect(result.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns matching users from the service', async () => {
    const result = await listAdminUsers({ search: 'أحمد', limit: 25 });

    expect(result.status).toBe(200);
    await expect(readBody<{ users: unknown[] }>(result)).resolves.toEqual({ users });
    expect(mockList).toHaveBeenCalledWith('أحمد', 25);
    expect(mockSyncAdminAllowlistMirror).toHaveBeenCalledWith(['admin@example.com']);
  });

  it('defaults to the schema limit when not provided', async () => {
    await listAdminUsers({ search: '' });

    expect(mockList).toHaveBeenCalledWith('', 50);
  });

  it('returns 400 for an invalid limit', async () => {
    const result = await listAdminUsers({ search: '', limit: 'abc' });

    expect(result.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('answers a readable 500 when the service throws', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listAdminUsers({ search: 'x' });

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تحميل المستخدمين.' },
    });
  });
});

describe('broadcastAnnouncement', () => {
  const userId = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';

  it('answers 401 when signed out and never broadcasts', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await broadcastAnnouncement({ title: 'إعلان' });

    expect(result.status).toBe(401);
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin and never broadcasts', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await broadcastAnnouncement({ title: 'إعلان' });

    expect(result.status).toBe(403);
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing title', async () => {
    const result = await broadcastAnnouncement({ body: 'نص' });

    expect(result.status).toBe(400);
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('returns 400 for a bad userIds entry', async () => {
    const result = await broadcastAnnouncement({ title: 'إعلان', userIds: ['not-a-uuid'] });

    expect(result.status).toBe(400);
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('passes userIds through to the broadcaster', async () => {
    mockBroadcaster.mockResolvedValue(2);

    const result = await broadcastAnnouncement({
      title: 'إعلان',
      body: 'نص',
      userIds: [userId],
    });

    expect(result.status).toBe(200);
    await expect(readBody<{ success: boolean; sent: number }>(result)).resolves.toEqual({
      success: true,
      sent: 2,
    });
    expect(mockBroadcaster).toHaveBeenCalledWith(
      { type: 'system_announcement', title: 'إعلان', body: 'نص' },
      [userId]
    );
  });

  it('passes an empty selection through (broadcaster fans out to all users)', async () => {
    await broadcastAnnouncement({ title: 'إعلان', userIds: [] });

    expect(mockBroadcaster).toHaveBeenCalledWith(
      { type: 'system_announcement', title: 'إعلان', body: undefined },
      []
    );
  });

  it('returns 500 when the broadcaster throws', async () => {
    mockBroadcaster.mockRejectedValue(new Error('boom'));

    const result = await broadcastAnnouncement({ title: 'إعلان' });

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'فشل إرسال الإعلان' },
    });
  });
});
