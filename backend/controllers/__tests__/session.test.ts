import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: vi.fn(),
}));

import { getAuthUser } from '@/backend/middleware/auth-guard';
import { readSession } from '@/backend/controllers/session';

const mockedGetAuthUser = vi.mocked(getAuthUser);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readSession', () => {
  it('answers with the signed-in user id', async () => {
    mockedGetAuthUser.mockResolvedValue({
      user: { id: 'user-1', email: 'someone@example.com' },
      supabase: {} as never,
    });

    await expect(readSession()).resolves.toMatchObject({
      status: 200,
      body: { userId: 'user-1' },
    });
  });

  it('answers null rather than 401 when nobody is signed in', async () => {
    mockedGetAuthUser.mockResolvedValue({ user: null, supabase: {} as never });

    await expect(readSession()).resolves.toMatchObject({
      status: 200,
      body: { userId: null },
    });
  });
});
