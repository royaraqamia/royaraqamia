import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAdminAuth = vi.fn();
const mockList = vi.fn();

vi.mock('@/backend/middleware/admin-auth-guard', () => ({
  requireAdminAuth: () => mockRequireAdminAuth(),
}));

vi.mock('@/backend/config/users', () => ({
  createAdminUsersService: () => ({ list: mockList }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { listAdminUsers } from '@/backend/controllers/admin-users';

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
  mockList.mockResolvedValue(users);
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
