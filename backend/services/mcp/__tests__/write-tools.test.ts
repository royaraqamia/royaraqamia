import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpUserContext } from '../session';

const userCtx: McpUserContext = {
  userId: 'u1',
  email: 'user@example.com',
  isAdmin: false,
  scopes: ['blog.write', 'linksnap.write', 'spendtrack.write', 'habitflow.write', 'profile.write'],
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

describe('blogpress write tools', () => {
  const postsRepoPath = '@/backend/repositories/blogpress/posts';

  beforeEach(() => vi.resetModules());

  it('createPostHandler requires blog.write scope', async () => {
    const { createPostHandler } = await import('../tools/blogpress');
    const result = await createPostHandler({ format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });

  it('publishPostHandler sets blog_visible for admins', async () => {
    const publishPost = vi.fn().mockResolvedValue({ slug: 'my-post' });
    vi.doMock(postsRepoPath, () => ({ createPostsRepository: () => ({ publishPost }) }));

    const { publishPostHandler } = await import('../tools/blogpress');
    const result = await publishPostHandler({ id: 'p1', format: 'json' }, adminCtx);
    expect(result.isError).toBeFalsy();
    expect(publishPost).toHaveBeenCalledWith('p1', 'u1', true);
    expect(result.structuredContent?.slug).toBe('my-post');
  });

  it('publishPostHandler hides non-admin posts from the blog', async () => {
    const publishPost = vi.fn().mockResolvedValue({ slug: 'my-post' });
    vi.doMock(postsRepoPath, () => ({ createPostsRepository: () => ({ publishPost }) }));

    const { publishPostHandler } = await import('../tools/blogpress');
    await publishPostHandler({ id: 'p1', format: 'json' }, userCtx);
    expect(publishPost).toHaveBeenCalledWith('p1', 'u1', false);
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

  it('createLinkHandler requires linksnap.write scope', async () => {
    const { createLinkHandler } = await import('../tools/linksnap');
    const result = await createLinkHandler(
      { url: 'https://example.com', format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });

  it('createLinkHandler shortens via the service on the user-scoped client', async () => {
    vi.doMock('@/backend/repositories/linksnap/supabase-short-link', () => ({
      SupabaseShortLinkRepository: class {
        exists = async () => false;
        create = async (link: { code: string; originalUrl: string }) => ({
          ...link,
          userId: 'u1',
          createdAt: new Date(),
          updatedAt: new Date(),
          isBlocked: false,
          expiresAt: null,
          passwordHash: null,
        });
      },
    }));
    vi.doMock('@/backend/services/linksnap/shorten-url', () => ({
      ShortenUrlService: class {
        execute = async (url: string, _userId: string, code?: string) => ({
          code: code ?? 'abc123',
          originalUrl: url,
          userId: 'u1',
          createdAt: new Date(),
          updatedAt: new Date(),
          isBlocked: false,
          expiresAt: null,
          passwordHash: null,
        });
      },
    }));

    const { createLinkHandler } = await import('../tools/linksnap');
    const result = await createLinkHandler(
      { url: 'https://example.com', code: 'abc', format: 'json' },
      userCtx
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.code).toBe('abc');
    expect(result.structuredContent?.originalUrl).toBe('https://example.com');
  });

  it('deleteLinkHandler rejects with missing scope', async () => {
    const { deleteLinkHandler } = await import('../tools/linksnap');
    const result = await deleteLinkHandler({ code: 'abc', format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
  });
});

describe('spendtrack write tools', () => {
  beforeEach(() => vi.resetModules());

  it('createExpenseHandler records expense with caller user id', async () => {
    const createExpense = vi.fn().mockResolvedValue('e1');
    vi.doMock('@/backend/repositories/spendtrack', () => ({
      createSpendtrackRepository: () => ({ createExpense }),
    }));

    const { createExpenseHandler } = await import('../tools/spendtrack');
    const result = await createExpenseHandler(
      { amount: 25.5, category_id: 'c1', date: '2026-08-19', format: 'json' },
      userCtx
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.id).toBe('e1');
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', amount: 25.5, category_id: 'c1' })
    );
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
          icon: 'Activity',
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
