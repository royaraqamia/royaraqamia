import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockList = vi.fn();
const mockUnreadCount = vi.fn();
const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockDelete = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
  });
});

vi.mock('@/backend/config/notifications', () => ({
  createSupabaseNotificationService: () => ({
    getNotifications: mockList,
    getUnreadCount: mockUnreadCount,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    delete: mockDelete,
  }),
  createNotificationFanout: () => vi.fn(),
  announcementIntent: vi.fn(),
}));

import {
  deleteNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/backend/controllers/notifications';

const SESSION = { user: { id: 'u-1', email: 'user@example.com' }, supabase: {} };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(SESSION);
  mockList.mockResolvedValue([]);
  mockUnreadCount.mockResolvedValue(0);
  mockMarkAsRead.mockResolvedValue(undefined);
  mockMarkAllAsRead.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

describe('listNotifications', () => {
  it('returns the notifications for the signed-in user', async () => {
    mockList.mockResolvedValue([{ id: 'n-1' }]);

    const result = await listNotifications();

    expect(result).toMatchObject({ status: 200, body: { notifications: [{ id: 'n-1' }] } });
  });

  it('answers 500, not 200-empty, when the read fails', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listNotifications();

    expect(result).toMatchObject({ status: 500, body: { error: 'فشل تحميل الإشعارات' } });
  });
});

describe('getUnreadNotificationCount', () => {
  it('answers 500, not a zero count, when the read fails', async () => {
    mockUnreadCount.mockRejectedValue(new Error('db down'));

    const result = await getUnreadNotificationCount();

    expect(result).toMatchObject({ status: 500, body: { error: 'فشل تحميل عدد الإشعارات' } });
  });

  it('returns the count on success', async () => {
    mockUnreadCount.mockResolvedValue(3);

    const result = await getUnreadNotificationCount();

    expect(result).toMatchObject({ status: 200, body: { count: 3 } });
  });
});

describe('markNotificationRead', () => {
  it('answers 500 when the write fails', async () => {
    mockMarkAsRead.mockRejectedValue(new Error('db down'));

    const result = await markNotificationRead('n-1');

    expect(result).toMatchObject({ status: 500, body: { error: 'فشل تحديث الإشعار' } });
  });
});

describe('markAllNotificationsRead', () => {
  it('answers 500 when the write fails', async () => {
    mockMarkAllAsRead.mockRejectedValue(new Error('db down'));

    const result = await markAllNotificationsRead();

    expect(result).toMatchObject({ status: 500, body: { error: 'فشل تحديث الإشعارات' } });
  });
});

describe('deleteNotification', () => {
  it('answers 500 when the write fails', async () => {
    mockDelete.mockRejectedValue(new Error('db down'));

    const result = await deleteNotification('n-1');

    expect(result).toMatchObject({ status: 500, body: { error: 'فشل حذف الإشعار' } });
  });
});
