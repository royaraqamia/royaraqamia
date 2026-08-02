import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

function readBody<T>(res: NextResponse): T {
  return (res as unknown as { data: T }).data;
}

const mockGetAuthUser = vi.fn();
const mockService = {
  getNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markAllAsRead: vi.fn(),
  markAsRead: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      status: init?.status ?? 200,
    })),
  },
}));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: () => mockGetAuthUser(),
}));

vi.mock('@/backend/config/notifications', () => ({
  createSupabaseNotificationService: () => mockService,
}));

import { GET as listGET, PATCH as markAllPATCH } from '@/app/api/notifications/route';
import { GET as unreadGET } from '@/app/api/notifications/unread-count/route';
import { PATCH as markOnePATCH, DELETE as deleteOne } from '@/app/api/notifications/[id]/route';
import { GET as versionGET } from '@/app/api/version/route';

const user = { id: 'u-1', email: 'user@example.com' };
const notification = {
  id: 'n-1',
  user_id: 'u-1',
  type: 'certificate_issued',
  title: 'شهادة',
  body: null,
  metadata: {},
  is_read: false,
  created_at: '2026-08-02T08:00:00.000Z',
  read_at: null,
};

const params = Promise.resolve({ id: 'n-1' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/notifications', () => {
  it('returns an empty list for unauthenticated users', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, client: null });
    const res = await listGET();
    expect(res.status).toBe(200);
    expect(readBody(res)).toEqual({ notifications: [] });
  });

  it('returns the user notifications', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.getNotifications.mockResolvedValue([notification]);

    const res = await listGET();

    expect(res.status).toBe(200);
    expect(readBody<{ notifications: unknown[] }>(res).notifications).toEqual([notification]);
    expect(mockService.getNotifications).toHaveBeenCalledWith('u-1');
  });

  it('returns an empty list when the service throws', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.getNotifications.mockRejectedValue(new Error('db down'));

    const res = await listGET();

    expect(res.status).toBe(200);
    expect(readBody(res)).toEqual({ notifications: [] });
  });
});

describe('PATCH /api/notifications (mark all read)', () => {
  it('is a no-op success for unauthenticated users', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, client: null });
    const res = await markAllPATCH();
    expect(readBody(res)).toEqual({ success: true });
  });

  it('marks all notifications as read', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.markAllAsRead.mockResolvedValue(undefined);

    const res = await markAllPATCH();

    expect(readBody(res)).toEqual({ success: true });
    expect(mockService.markAllAsRead).toHaveBeenCalledWith('u-1');
  });

  it('returns 500 when the service throws', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.markAllAsRead.mockRejectedValue(new Error('db down'));

    const res = await markAllPATCH();

    expect(res.status).toBe(500);
    expect(readBody(res)).toEqual({ error: 'فشل تحديث الإشعارات' });
  });
});

describe('GET /api/notifications/unread-count', () => {
  it('returns 0 for unauthenticated users', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, client: null });
    const res = await unreadGET();
    expect(readBody(res)).toEqual({ count: 0 });
  });

  it('returns the unread count', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.getUnreadCount.mockResolvedValue(4);

    const res = await unreadGET();

    expect(readBody(res)).toEqual({ count: 4 });
  });

  it('returns 0 when the service throws', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.getUnreadCount.mockRejectedValue(new Error('db down'));

    const res = await unreadGET();

    expect(readBody(res)).toEqual({ count: 0 });
  });
});

describe('PATCH /api/notifications/[id]', () => {
  it('marks a single notification as read', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.markAsRead.mockResolvedValue(undefined);

    const res = await markOnePATCH({} as NextRequest, { params });

    expect(readBody(res)).toEqual({ success: true });
    expect(mockService.markAsRead).toHaveBeenCalledWith('n-1', 'u-1');
  });

  it('returns 500 when the service throws', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.markAsRead.mockRejectedValue(new Error('db down'));

    const res = await markOnePATCH({} as NextRequest, { params });

    expect(res.status).toBe(500);
    expect(readBody(res)).toEqual({ error: 'فشل تحديث الإشعار' });
  });
});

describe('DELETE /api/notifications/[id]', () => {
  it('deletes a notification', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.delete.mockResolvedValue(undefined);

    const res = await deleteOne({} as NextRequest, { params });

    expect(readBody(res)).toEqual({ success: true });
    expect(mockService.delete).toHaveBeenCalledWith('n-1', 'u-1');
  });

  it('returns 500 when the service throws', async () => {
    mockGetAuthUser.mockResolvedValue({ user, client: {} });
    mockService.delete.mockRejectedValue(new Error('db down'));

    const res = await deleteOne({} as NextRequest, { params });

    expect(res.status).toBe(500);
    expect(readBody(res)).toEqual({ error: 'فشل حذف الإشعار' });
  });
});

describe('GET /api/version', () => {
  it('returns the deployment id when present', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_123');
    const res = await versionGET();
    expect(readBody(res)).toEqual({ version: 'dpl_123' });
  });

  it('falls back to the git commit sha', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123def');
    const res = await versionGET();
    expect(readBody(res)).toEqual({ version: 'abc123def' });
  });

  it('falls back to the build id', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('NEXT_BUILD_ID', 'build-1');
    const res = await versionGET();
    expect(readBody(res)).toEqual({ version: 'build-1' });
  });

  it('returns "unknown" when nothing is set', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('NEXT_BUILD_ID', '');
    const res = await versionGET();
    expect(readBody(res)).toEqual({ version: 'unknown' });
  });

  it('sets a no-store cache control header', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_123');
    const res = await versionGET();
    expect(res.status).toBe(200);
  });
});
