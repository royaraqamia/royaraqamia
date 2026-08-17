import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAdminAuth = vi.fn();
const mockList = vi.fn();
const mockGetAuthUser = vi.fn();
const mockBroadcaster = vi.fn();

vi.mock('@/backend/middleware/admin-auth-guard', () => ({
  requireAdminAuth: () => mockRequireAdminAuth(),
}));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: () => mockGetAuthUser(),
}));

vi.mock('@/backend/config/users', () => ({
  createAdminUsersService: () => ({ list: mockList }),
}));

vi.mock('@/backend/config/notifications', () => ({
  createAdminBroadcaster: () => mockBroadcaster,
  createSupabaseNotificationService: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { listAdminUsers } from '@/backend/controllers/admin-users';
import { broadcastAnnouncement } from '@/backend/controllers/notifications';

const users = [{ id: 'u-1', name: 'أحمد محمد', email: 'ahmed@example.com', avatar_url: null }];

async function readBody<T>(result: Awaited<ReturnType<typeof listAdminUsers>>): Promise<T> {
  if ('redirect' in result) {
    throw new Error('unexpected redirect');
  }
  return result.body as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminAuth.mockResolvedValue({});
  mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
  mockList.mockResolvedValue(users);
  mockBroadcaster.mockResolvedValue(0);
});

describe('listAdminUsers', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAdminAuth.mockRejectedValue(new Error('UNAUTHORIZED'));

    const result = await listAdminUsers({ search: '' });

    expect(result.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not an admin', async () => {
    mockRequireAdminAuth.mockRejectedValue(new Error('FORBIDDEN'));

    const result = await listAdminUsers({ search: '' });

    expect(result.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns matching users from the service', async () => {
    const result = await listAdminUsers({ search: 'أحمد', limit: 25 });

    expect(result.status).toBe(200);
    await expect(readBody<{ users: unknown[] }>(result)).resolves.toEqual({ users });
    expect(mockList).toHaveBeenCalledWith('أحمد', 25);
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

  it('returns an empty list when the service throws', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listAdminUsers({ search: 'x' });

    expect(result.status).toBe(200);
    await expect(readBody<{ users: unknown[] }>(result)).resolves.toEqual({ users: [] });
  });
});

describe('broadcastAnnouncement', () => {
  const userId = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';
  it('returns 401 when unauthenticated', async () => {
    mockRequireAdminAuth.mockRejectedValue(new Error('UNAUTHORIZED'));

    const result = await broadcastAnnouncement({ title: 'إعلان' });

    expect(result.status).toBe(401);
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not an admin', async () => {
    mockRequireAdminAuth.mockRejectedValue(new Error('FORBIDDEN'));

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

    expect(result.status).toBe(500);
  });
});
