import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpServer } from '../tools/registry';
import type { McpUserContext } from '../session';

const anonymousCtx: McpUserContext = {
  userId: null,
  email: null,
  isAdmin: false,
  scopes: [],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const userCtx: McpUserContext = {
  userId: 'u1',
  email: 'user@example.com',
  isAdmin: false,
  scopes: [
    'blog.read',
    'linksnap.read',
    'spendtrack.read',
    'habitflow.read',
    'certificates.read',
    'profile.read',
  ],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const restrictedCtx: McpUserContext = {
  ...userCtx,
  scopes: [],
};

describe('createMcpServer tool registration', () => {
  it('registers all read tools', () => {
    const server = createMcpServer(anonymousCtx);
    expect(server).toBeInstanceOf(McpServer);
  });
});

describe('guard: MissingScopeError', () => {
  it('throws when no matching scope is granted', async () => {
    const { listHabitsHandler } = await import('../tools/habitflow');
    const result = await listHabitsHandler(
      { page_size: 10, offset: 0, format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });
});

describe('profile tools', () => {
  const profileRepoPath = '@/backend/repositories/users/user-profile-repository';

  beforeEach(() => vi.resetModules());

  it('getProfileHandler returns profile json', async () => {
    vi.doMock(profileRepoPath, () => ({
      createUserProfileRepository: () => ({
        upsert: vi.fn(),
        getById: async () => ({
          id: 'u1',
          email: 'user@example.com',
          name: 'Test User',
          avatar_url: null,
          bio: 'Hello',
          is_admin: false,
        }),
      }),
    }));

    const { getProfileHandler } = await import('../tools/profile');
    const result = await getProfileHandler({ format: 'json' }, userCtx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.email).toBe('user@example.com');
    expect(result.structuredContent?.name).toBe('Test User');
  });

  it('getProfileHandler rejects when profile.read scope is missing', async () => {
    const { getProfileHandler } = await import('../tools/profile');
    const result = await getProfileHandler({ format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
  });
});

describe('blog tools', () => {
  const postsRepoPath = '@/backend/repositories/blogpress/posts';

  beforeEach(() => vi.resetModules());

  it('listPostsHandler returns own posts for authenticated caller', async () => {
    vi.doMock(postsRepoPath, () => ({
      createPostsRepository: () => ({
        listPostsByAuthor: async () => [
          {
            id: 'p1',
            author_id: 'u1',
            title: 'My Post',
            slug: 'my-post',
            content: null,
            status: 'published',
            cover_image: null,
            meta_title: null,
            meta_desc: null,
            published_at: '2026-01-01T00:00:00.000Z',
            publish_at: null,
            view_count: 5,
            featured: false,
            blog_visible: true,
            reading_time_minutes: 2,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    }));

    const { listPostsHandler } = await import('../tools/blogpress');
    const result = await listPostsHandler({ page_size: 10, offset: 0, format: 'json' }, userCtx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.total).toBe(1);
    expect((result.structuredContent?.posts as Array<{ title: string }>)[0]?.title).toBe('My Post');
  });

  it('listPostsHandler rejects anonymous callers without blog.read scope', async () => {
    vi.doMock(postsRepoPath, () => ({
      createPostsRepository: () => ({
        listPostsByAuthor: async () => [],
      }),
    }));

    const { listPostsHandler } = await import('../tools/blogpress');
    const result = await listPostsHandler(
      { page_size: 10, offset: 0, format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });

  it('getPostHandler returns content for own post', async () => {
    vi.doMock(postsRepoPath, () => ({
      createPostsRepository: () => ({
        getPostForUser: async () => ({
          id: 'p1',
          author_id: 'u1',
          title: 'My Post',
          slug: 'my-post',
          content: 'Hello world content',
          status: 'published',
          cover_image: null,
          meta_title: null,
          meta_desc: null,
          published_at: '2026-01-01T00:00:00.000Z',
          publish_at: null,
          view_count: 5,
          featured: false,
          blog_visible: true,
          reading_time_minutes: 2,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }),
      }),
    }));

    const { getPostHandler } = await import('../tools/blogpress');
    const result = await getPostHandler({ id: 'p1', format: 'markdown' }, userCtx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('Hello world content');
  });
});

describe('linksnap tools', () => {
  beforeEach(() => vi.resetModules());

  it('getAnalyticsHandler rejects when link is not owned by caller', async () => {
    vi.doMock('@/backend/repositories/linksnap/supabase-analytics', () => ({
      SupabaseAnalyticsRepository: class {
        getLinkOwner = async () => 'someone-else';
        getSummaryForLink = async () => ({});
      },
    }));
    vi.doMock('@/backend/repositories/linksnap/supabase-short-link', () => ({
      SupabaseShortLinkRepository: class {},
    }));

    const { getAnalyticsHandler } = await import('../tools/linksnap');
    const result = await getAnalyticsHandler({ code: 'x123', format: 'json' }, userCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No short link');
  });

  it('listLinksHandler requires linksnap.read scope', async () => {
    const { listLinksHandler } = await import('../tools/linksnap');
    const result = await listLinksHandler(
      { page_size: 10, offset: 0, format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });
});

describe('spendtrack tools', () => {
  beforeEach(() => vi.resetModules());

  it('getSummaryHandler returns totals', async () => {
    vi.doMock('@/backend/repositories/spendtrack', () => ({
      createSpendtrackRepository: () => ({
        getTotalExpenses: async () => 120.5,
        getCategoryBreakdown: async () => [
          { categoryId: 'c1', colorHex: '#fff', name: 'Food', total: 80 },
        ],
        getBudgets: async () => [{ category_id: null, amount: 500 }],
        getDailyTotals: async () => [{ date: '2026-08-01', total: 40 }],
        getUserCurrency: async () => 'SAR',
      }),
    }));

    const { getSummaryHandler } = await import('../tools/spendtrack');
    const result = await getSummaryHandler({ month: '2026-08', format: 'json' }, userCtx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.total).toBe(120.5);
    expect(result.structuredContent?.currency).toBe('SAR');
    expect(result.structuredContent?.month).toBe('2026-08');
  });

  it('listTransactionsHandler requires spendtrack.read scope', async () => {
    const { listTransactionsHandler } = await import('../tools/spendtrack');
    const result = await listTransactionsHandler(
      { page_size: 10, offset: 0, format: 'json' },
      restrictedCtx
    );
    expect(result.isError).toBe(true);
  });
});

describe('certificates tools', () => {
  beforeEach(() => vi.resetModules());

  it('verifyCertificateHandler works anonymously and returns public shape', async () => {
    vi.doMock('@/backend/repositories/certificates', () => ({
      createCertificatesRepository: () => ({
        getByCode: async () => ({
          id: 'c1',
          certificate_code: 'COMP-2026-A1B2C3D4',
          student_name: 'أحمد',
          course_name: 'برمجة الويب',
          issue_date: '2026-01-01',
          expiration_date: null,
          grade_or_status: 'ممتاز',
          recipient_email: 'x@example.com',
          recipient_user_ids: ['u1'],
          created_at: '2026-01-01T00:00:00.000Z',
        }),
      }),
    }));

    const { verifyCertificateHandler } = await import('../tools/certificates');
    const result = await verifyCertificateHandler(
      { code: 'COMP-2026-A1B2C3D4', format: 'json' },
      anonymousCtx
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.certificate_code).toBe('COMP-2026-A1B2C3D4');
    // public shape must not leak recipient data
    expect(result.structuredContent?.recipient_email).toBeUndefined();
    expect(result.structuredContent?.recipient_user_ids).toBeUndefined();
  });

  it('listMineHandler requires certificates.read scope', async () => {
    const { listMineHandler } = await import('../tools/certificates');
    const result = await listMineHandler({ format: 'json' }, restrictedCtx);
    expect(result.isError).toBe(true);
  });
});
