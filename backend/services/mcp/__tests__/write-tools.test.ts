import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpUserContext } from '../session';

const userCtx: McpUserContext = {
  userId: 'u1',
  email: 'user@example.com',
  isAdmin: false,
  scopes: [
    'community.write',
    'linksnap.write',
    'spendtrack.write',
    'habitflow.write',
    'profile.write',
  ],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const adminCtx: McpUserContext = {
  ...userCtx,
  email: 'admin@example.com',
  isAdmin: true,
};

const restrictedCtx: McpUserContext = { ...userCtx, scopes: [] };

// `vi.resetModules()` + a fresh dynamic import of the tools module runs in
// every test; under a saturated parallel suite that can exceed Vitest's 5s
// default and time out even though the code under test is correct. Give the
// whole file headroom so scheduling starvation is not reported as a failure.
describe('blogpress write tools', { timeout: 20_000 }, () => {
  const postsRepoPath = '@/backend/repositories/blogpress/posts';

  beforeEach(() => vi.resetModules());

  it('createPostHandler requires community.write scope', async () => {
    const { createPostHandler } = await import('../tools/blogpress');
    const result = await createPostHandler({ format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });

  it('publishPostHandler publishes through the owning author', async () => {
    const publishPost = vi.fn().mockResolvedValue({ slug: 'my-post' });
    vi.doMock(postsRepoPath, () => ({ createPostsRepository: () => ({ publishPost }) }));

    const { publishPostHandler } = await import('../tools/blogpress');
    const result = await publishPostHandler({ id: 'p1', format: 'json' }, adminCtx);
    expect(result.isError).toBeFalsy();
    expect(publishPost).toHaveBeenCalledWith('p1', 'u1');
    expect(result.structuredContent?.slug).toBe('my-post');
  });

  it('publishPostHandler publishes non-admin posts too', async () => {
    const publishPost = vi.fn().mockResolvedValue({ slug: 'my-post' });
    vi.doMock(postsRepoPath, () => ({ createPostsRepository: () => ({ publishPost }) }));

    const { publishPostHandler } = await import('../tools/blogpress');
    await publishPostHandler({ id: 'p1', format: 'json' }, userCtx);
    expect(publishPost).toHaveBeenCalledWith('p1', 'u1');
  });

  it('deletePostHandler passes the caller user id for ownership scoping', async () => {
    const deletePost = vi.fn().mockResolvedValue({ slug: 'my-post' });
    vi.doMock(postsRepoPath, () => ({ createPostsRepository: () => ({ deletePost }) }));

    const { deletePostHandler } = await import('../tools/blogpress');
    const result = await deletePostHandler({ id: 'p1', format: 'json' }, userCtx);
    expect(result.isError).toBeFalsy();
    expect(deletePost).toHaveBeenCalledWith('p1', 'u1');
  });
});

describe('linksnap write tools', () => {
  beforeEach(() => vi.resetModules());

  function makeRepo(overrides: Record<string, unknown> = {}) {
    return {
      findByCode: vi.fn().mockResolvedValue(null),
      findByClientId: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      setExpiryMany: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
      listByUserId: vi.fn().mockResolvedValue([]),
      listByUserIdIncludingDeleted: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  function mockRepositoryFactory(repo: Record<string, unknown>) {
    const createShortLinkRepository = vi.fn(() => repo);
    vi.doMock('@/backend/config/linksnap', () => ({ createShortLinkRepository }));
    return createShortLinkRepository;
  }

  it('createLinkHandler requires linksnap.write scope', async () => {
    const { createLinkHandler } = await import('../tools/linksnap');
    const result = await createLinkHandler(
      { url: 'https://example.com', format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });

  it('createLinkHandler builds the write repository from the service-role factory', async () => {
    const created = {
      code: 'abc',
      originalUrl: 'https://example.com',
      userId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
      isBlocked: false,
      expiresAt: null,
      passwordHash: null,
      clientId: null,
      deletedAt: null,
    };
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(created) });
    const createShortLinkRepository = mockRepositoryFactory(repo);

    const { createLinkHandler } = await import('../tools/linksnap');
    const result = await createLinkHandler(
      { url: 'https://example.com', code: 'abc', format: 'json' },
      userCtx
    );

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.code).toBe('abc');
    expect(createShortLinkRepository).toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc', originalUrl: 'https://example.com', userId: 'u1' })
    );
  });

  it('updateLinkHandler writes through the service-role factory', async () => {
    const current = {
      code: 'abc',
      originalUrl: 'https://old.example.com',
      userId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
      isBlocked: false,
      expiresAt: null,
      passwordHash: null,
      clientId: null,
      deletedAt: null,
    };
    const repo = makeRepo({
      findByCode: vi.fn().mockResolvedValue(current),
      update: vi.fn().mockResolvedValue({ ...current, originalUrl: 'https://new.example.com' }),
    });
    const createShortLinkRepository = mockRepositoryFactory(repo);

    const { updateLinkHandler } = await import('../tools/linksnap');
    const result = await updateLinkHandler(
      { code: 'abc', url: 'https://new.example.com', format: 'json' },
      userCtx
    );

    expect(result.isError).toBeFalsy();
    expect(createShortLinkRepository).toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('abc', { originalUrl: 'https://new.example.com' });
  });

  it('updateLinkHandler still refuses a link owned by another user', async () => {
    const foreign = {
      code: 'abc',
      originalUrl: 'https://old.example.com',
      userId: 'u2',
      createdAt: new Date(),
      updatedAt: new Date(),
      isBlocked: false,
      expiresAt: null,
      passwordHash: null,
      clientId: null,
      deletedAt: null,
    };
    const repo = makeRepo({ findByCode: vi.fn().mockResolvedValue(foreign) });
    mockRepositoryFactory(repo);

    const { updateLinkHandler } = await import('../tools/linksnap');
    const result = await updateLinkHandler(
      { code: 'abc', url: 'https://new.example.com', format: 'json' },
      userCtx
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Unauthorized');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('deleteLinkHandler writes through the service-role factory', async () => {
    const current = {
      code: 'abc',
      originalUrl: 'https://example.com',
      userId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
      isBlocked: false,
      expiresAt: null,
      passwordHash: null,
      clientId: null,
      deletedAt: null,
    };
    const repo = makeRepo({
      findByCode: vi.fn().mockResolvedValue(current),
      delete: vi.fn().mockResolvedValue(true),
    });
    const createShortLinkRepository = mockRepositoryFactory(repo);

    const { deleteLinkHandler } = await import('../tools/linksnap');
    const result = await deleteLinkHandler({ code: 'abc', format: 'json' }, userCtx);

    expect(result.isError).toBeFalsy();
    expect(createShortLinkRepository).toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith('abc', 'u1');
  });

  it('deleteLinkHandler rejects with missing scope', async () => {
    const { deleteLinkHandler } = await import('../tools/linksnap');
    const result = await deleteLinkHandler({ code: 'abc', format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
  });

  it('write handlers reject a null user before touching the write repository', async () => {
    const repo = makeRepo();
    const createShortLinkRepository = mockRepositoryFactory(repo);
    const anonymousCtx: McpUserContext = { ...userCtx, userId: null };

    const { createLinkHandler, updateLinkHandler, deleteLinkHandler } =
      await import('../tools/linksnap');

    for (const result of [
      await createLinkHandler({ url: 'https://example.com', format: 'json' }, anonymousCtx),
      await updateLinkHandler(
        { code: 'abc', url: 'https://example.com', format: 'json' },
        anonymousCtx
      ),
      await deleteLinkHandler({ code: 'abc', format: 'json' }, anonymousCtx),
    ]) {
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('requires an authenticated session');
    }
    expect(createShortLinkRepository).not.toHaveBeenCalled();
  });
});

describe('spendtrack write tools', () => {
  beforeEach(() => vi.resetModules());

  it('createExpenseHandler routes through the spendtrack module with caller user id', async () => {
    const createExpense = vi.fn().mockResolvedValue('e1');
    vi.doMock('@/backend/config/spendtrack', () => ({
      createSpendtrackService: () => ({ createExpense }),
    }));

    const { createExpenseHandler } = await import('../tools/spendtrack');
    const result = await createExpenseHandler(
      { amount: 25.5, category_id: 'c1', date: '2026-08-19', format: 'json' },
      userCtx
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.id).toBe('e1');
    expect(createExpense).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ amount: 25.5, category_id: 'c1', date: '2026-08-19' })
    );
  });

  it('createExpenseHandler surfaces a module rejection as a tool error', async () => {
    vi.doMock('@/backend/config/spendtrack', () => ({
      createSpendtrackService: () => ({
        createExpense: vi
          .fn()
          .mockRejectedValue(new Error('مجموع التقسيمات يجب أن يساوي المبلغ الإجمالي')),
      }),
    }));

    const { createExpenseHandler } = await import('../tools/spendtrack');
    const result = await createExpenseHandler(
      { amount: 25.5, category_id: 'c1', date: '2026-08-19', format: 'json' },
      userCtx
    );

    expect(result.isError).toBe(true);
  });

  it('updateExpenseHandler forwards only the provided fields', async () => {
    const updateExpense = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/backend/config/spendtrack', () => ({
      createSpendtrackService: () => ({ updateExpense }),
    }));

    const { updateExpenseHandler } = await import('../tools/spendtrack');
    const result = await updateExpenseHandler(
      { id: 'e1', description: 'عشاء', format: 'json' },
      userCtx
    );

    expect(result.isError).toBeFalsy();
    // Omitted amount/category_id/date must not be sent as `0`/`''` placeholders.
    expect(updateExpense).toHaveBeenCalledWith('e1', 'u1', { description: 'عشاء' });
  });

  it('createCategoryHandler routes through the spendtrack module', async () => {
    const createCategory = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/backend/config/spendtrack', () => ({
      createSpendtrackService: () => ({ createCategory }),
    }));

    const { createCategoryHandler } = await import('../tools/spendtrack');
    const result = await createCategoryHandler(
      { name: 'Food', color_hex: '#aabbcc', format: 'json' },
      userCtx
    );

    expect(result.isError).toBeFalsy();
    expect(createCategory).toHaveBeenCalledWith('u1', { name: 'Food', colorHex: '#aabbcc' });
  });

  it('setBudgetHandler requires spendtrack.write scope', async () => {
    const { setBudgetHandler } = await import('../tools/spendtrack');
    const result = await setBudgetHandler(
      { month: '2026-08', amount: 1000, format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });
});

describe('habitflow write tools', () => {
  beforeEach(() => vi.resetModules());

  it('createHabitHandler creates habit scoped to caller', async () => {
    vi.doMock('@/backend/repositories/habitflow/supabase-repository', () => ({
      SupabaseHabitRepository: class {
        createHabit = async (input: { name: string }) => ({
          id: 'h1',
          name: input.name,
          frequency: 'daily' as const,
          createdAt: '2026-08-19',
          archived: false,
          target: null,
          targetPeriod: null,
          reminderTime: null,
        });
      },
    }));

    const { createHabitHandler } = await import('../tools/habitflow');
    const result = await createHabitHandler({ name: 'Reading', format: 'json' }, userCtx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.id).toBe('h1');
    expect(result.structuredContent?.name).toBe('Reading');
  });

  it('toggleLogHandler requires habitflow.write scope', async () => {
    const { toggleLogHandler } = await import('../tools/habitflow');
    const result = await toggleLogHandler(
      { habit_id: 'h1', date: '2026-08-19', completed: true, format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });
});

describe('profile write tools', () => {
  const profileRepoPath = '@/backend/repositories/users/user-profile-repository';

  beforeEach(() => vi.resetModules());

  it('updateProfileHandler updates the caller profile', async () => {
    const updateProfile = vi.fn().mockResolvedValue(undefined);
    vi.doMock(profileRepoPath, () => ({
      createUserProfileRepository: () => ({ updateProfile, upsert: vi.fn(), getById: vi.fn() }),
    }));

    const { updateProfileHandler } = await import('../tools/profile');
    const result = await updateProfileHandler(
      { name: 'Ali', bio: 'Engineer', format: 'json' },
      userCtx
    );
    expect(result.isError).toBeFalsy();
    expect(updateProfile).toHaveBeenCalledWith('u1', {
      name: 'Ali',
      avatar_url: undefined,
      bio: 'Engineer',
    });
    expect(result.structuredContent?.message).toContain('updated');
  });

  it('updateProfileHandler requires profile.write scope', async () => {
    const { updateProfileHandler } = await import('../tools/profile');
    const result = await updateProfileHandler({ name: 'Ali', format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
  });
});
