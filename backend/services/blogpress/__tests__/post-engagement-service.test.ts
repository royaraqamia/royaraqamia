import { describe, it, expect, vi } from 'vitest';

import {
  PostEngagementRefusedError,
  PostEngagementService,
  type PostEngagementServiceDeps,
} from '@/backend/services/blogpress/post-engagement-service';
import type {
  PostCommentRow,
  PostEngagementRepository,
} from '@/backend/repositories/blogpress/post-engagement-repository';

const POST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_POST = '22222222-2222-4222-8222-222222222222';
const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_MEMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeRepository(overrides: Partial<PostEngagementRepository> = {}) {
  const repository: PostEngagementRepository = {
    findPostIdBySlug: vi.fn(async () => POST_ID),
    counts: vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { likes: 0, comments: 0 }]))
    ),
    likedAmong: vi.fn(async () => []),
    setLike: vi.fn(async () => ({ liked: true, likeCount: 7 })),
    listComments: vi.fn(async () => ({ rows: [], nextCursor: null, total: 0 })),
    authorsByIds: vi.fn(async () => ({})),
    postAuthor: vi.fn(async () => OTHER_MEMBER),
    commentWriteGate: vi.fn(async () => 'ok' as const),
    getComment: vi.fn(async () => null),
    createComment: vi.fn(async () => ({
      id: 'c1',
      createdAt: '2026-01-01T00:00:00Z',
      commentCount: 1,
    })),
    updateComment: vi.fn(async () => null),
    deleteComment: vi.fn(async () => null),
    reportComment: vi.fn(async () => ({ id: 'r1', createdAt: '2026-01-01T00:00:00Z' })),
    ...overrides,
  };
  return repository;
}

function makeService(
  repository: PostEngagementRepository,
  allowed = true
): {
  service: PostEngagementService;
  checkRateLimit: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
} {
  const checkRateLimit = vi.fn(async () => allowed);
  const notify = vi.fn(async () => undefined);
  const deps: PostEngagementServiceDeps = { engagement: repository, notify, checkRateLimit };
  return { service: new PostEngagementService(deps), checkRateLimit, notify };
}

const comment = (overrides: Partial<PostCommentRow> = {}): PostCommentRow => ({
  id: 'c1',
  postId: POST_ID,
  authorId: VIEWER,
  body: 'تعليق',
  createdAt: '2026-01-01T00:00:00Z',
  editedAt: null,
  ...overrides,
});

describe('PostEngagementService.statesFor', () => {
  it('reads a page of cards in two calls, not two per card', async () => {
    const repository = makeRepository({
      counts: vi.fn(async () => ({
        [POST_ID]: { likes: 4, comments: 2 },
        [OTHER_POST]: { likes: 0, comments: 0 },
      })),
      likedAmong: vi.fn(async () => [POST_ID]),
    });
    const { service } = makeService(repository);

    const states = await service.statesFor(VIEWER, [POST_ID, OTHER_POST, POST_ID]);

    expect(repository.counts).toHaveBeenCalledTimes(1);
    expect(repository.likedAmong).toHaveBeenCalledTimes(1);
    expect(repository.likedAmong).toHaveBeenCalledWith(VIEWER, [POST_ID, OTHER_POST]);
    expect(states[POST_ID]).toEqual({
      postId: POST_ID,
      likeCount: 4,
      commentCount: 2,
      liked: true,
    });
    expect(states[OTHER_POST]).toEqual({
      postId: OTHER_POST,
      likeCount: 0,
      commentCount: 0,
      liked: false,
    });
  });

  it('answers a guest with zeros and no like, without asking for one', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository);

    const states = await service.statesFor(null, [POST_ID]);

    expect(repository.likedAmong).not.toHaveBeenCalled();
    expect(states[POST_ID]?.liked).toBe(false);
  });

  it('asks the database for nothing when there is no post', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository);

    expect(await service.statesFor(VIEWER, [])).toEqual({});
    expect(repository.counts).not.toHaveBeenCalled();
  });
});

describe('PostEngagementService.setLike', () => {
  it('resolves the slug and answers the count the write reported', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository);

    const result = await service.setLike(VIEWER, 'a-post', true);

    expect(repository.findPostIdBySlug).toHaveBeenCalledWith('a-post');
    expect(repository.setLike).toHaveBeenCalledWith(POST_ID, VIEWER, true);
    expect(result).toEqual({ liked: true, likeCount: 7 });
  });

  it('spends the budget before the write, so a refused press writes nothing', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository, false);

    await expect(service.setLike(VIEWER, 'a-post', true)).rejects.toMatchObject({ status: 429 });
    expect(repository.setLike).not.toHaveBeenCalled();
  });

  it('refuses a post that is not public', async () => {
    const repository = makeRepository({ findPostIdBySlug: vi.fn(async () => null) });
    const { service } = makeService(repository);

    await expect(service.setLike(VIEWER, 'gone', true)).rejects.toBeInstanceOf(
      PostEngagementRefusedError
    );
    expect(repository.setLike).not.toHaveBeenCalled();
  });
});

describe('PostEngagementService.thread', () => {
  it('joins the page’s authors in one read and keeps the server’s total', async () => {
    const repository = makeRepository({
      listComments: vi.fn(async () => ({
        rows: [comment(), comment({ id: 'c2', authorId: OTHER_MEMBER })],
        nextCursor: 'next',
        total: 12,
      })),
      authorsByIds: vi.fn(async () => ({
        [VIEWER]: { id: VIEWER, username: 'ruya', name: 'رؤية', avatarUrl: null },
        [OTHER_MEMBER]: { id: OTHER_MEMBER, username: 'salah', name: null, avatarUrl: '/s.png' },
      })),
    });
    const { service } = makeService(repository);

    const page = await service.thread('a-post', null, 20);

    expect(repository.authorsByIds).toHaveBeenCalledTimes(1);
    expect(page.total).toBe(12);
    expect(page.nextCursor).toBe('next');
    expect(page.comments[0]?.author).toEqual({
      id: VIEWER,
      username: 'ruya',
      name: 'رؤية',
      avatar_url: null,
    });
    expect(page.comments[1]?.author?.avatar_url).toBe('/s.png');
  });

  it('passes the viewer to the block-aware repository read', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository);

    await service.thread('a-post', null, 20, OTHER_MEMBER);

    expect(repository.listComments).toHaveBeenCalledWith(POST_ID, null, 20, OTHER_MEMBER);
  });

  it('reads as a guest when no viewer is signed in', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository);

    await service.thread('a-post', null, 20);

    expect(repository.listComments).toHaveBeenCalledWith(POST_ID, null, 20, null);
  });
});

describe('PostEngagementService.comment', () => {
  it('answers the stored row and the post’s new count', async () => {
    const repository = makeRepository({
      createComment: vi.fn(async () => ({
        id: 'c9',
        createdAt: '2026-02-02T00:00:00Z',
        commentCount: 3,
      })),
      authorsByIds: vi.fn(async () => ({
        [VIEWER]: { id: VIEWER, username: 'ruya', name: 'رؤية', avatarUrl: null },
      })),
    });
    const { service } = makeService(repository);

    const result = await service.comment(VIEWER, 'a-post', 'نصّ');

    expect(result.commentCount).toBe(3);
    expect(result.comment).toMatchObject({
      id: 'c9',
      postId: POST_ID,
      body: 'نصّ',
      createdAt: '2026-02-02T00:00:00Z',
      editedAt: null,
    });
  });

  it('refuses a post that is not public without writing', async () => {
    const repository = makeRepository({ findPostIdBySlug: vi.fn(async () => null) });
    const { service } = makeService(repository);

    await expect(service.comment(VIEWER, 'gone', 'نصّ')).rejects.toMatchObject({ status: 404 });
    expect(repository.createComment).not.toHaveBeenCalled();
  });

  it('refuses a blocked pair with an actionable sentence', async () => {
    const repository = makeRepository({
      commentWriteGate: vi.fn(async () => 'blocked' as const),
    });
    const { service } = makeService(repository);

    await expect(service.comment(VIEWER, 'a-post', 'نصّ')).rejects.toMatchObject({
      status: 403,
      message: 'لا يمكنك التعليق على منشور بينك وبين صاحبه حظر.',
    });
    expect(repository.createComment).not.toHaveBeenCalled();
  });

  it('refuses an unconfirmed writer without writing', async () => {
    const repository = makeRepository({
      commentWriteGate: vi.fn(async () => 'unverified' as const),
    });
    const { service } = makeService(repository);

    await expect(service.comment(VIEWER, 'a-post', 'نصّ')).rejects.toMatchObject({ status: 403 });
    expect(repository.createComment).not.toHaveBeenCalled();
  });

  it('tells the post author once, with the type, excerpt and thread destination', async () => {
    const repository = makeRepository({
      authorsByIds: vi.fn(async () => ({
        [VIEWER]: { id: VIEWER, username: 'sara', name: 'سارة', avatarUrl: null },
      })),
    });
    const { service, notify } = makeService(repository);

    await service.comment(VIEWER, 'a-post', 'نصّ طويل');

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith({
      user_id: OTHER_MEMBER,
      type: 'post_comment',
      title: 'تعليق جديد على منشورك',
      body: 'تعليق جديد من سارة: «نصّ طويل». يمكنك حذفه من منشورك.',
      metadata: { post_slug: 'a-post', comment_id: 'c1' },
    });
  });

  it('bounds the excerpt to one short line', async () => {
    const long = 'كلمة '.repeat(60);
    const { service, notify } = makeService(makeRepository());

    await service.comment(VIEWER, 'a-post', long);

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    const body = (notify.mock.calls[0]?.[0] as { body: string }).body;
    expect(body).toContain('…');
    expect(body.length).toBeLessThan(200);
  });

  it('writes no notice when members comment on their own post', async () => {
    const repository = makeRepository({ postAuthor: vi.fn(async () => VIEWER) });
    const { service, notify } = makeService(repository);

    await expect(service.comment(VIEWER, 'a-post', 'نصّ')).resolves.toMatchObject({
      commentCount: 1,
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(notify).not.toHaveBeenCalled();
  });

  it('never lets a rejected producer fail a comment that was written', async () => {
    const { service, notify } = makeService(makeRepository());
    notify.mockRejectedValue(new Error('push is down'));

    await expect(service.comment(VIEWER, 'a-post', 'نصّ')).resolves.toMatchObject({
      commentCount: 1,
    });
  });

  it('never lets a failed host read fail a comment that was written', async () => {
    const repository = makeRepository({
      postAuthor: vi.fn(async () => {
        throw new Error('read is down');
      }),
    });
    const { service } = makeService(repository);

    await expect(service.comment(VIEWER, 'a-post', 'نصّ')).resolves.toMatchObject({
      commentCount: 1,
    });
  });
});

describe('PostEngagementService.reportComment', () => {
  it('files a report with the reason and rate-limits it separately', async () => {
    const repository = makeRepository({
      getComment: vi.fn(async () => comment({ authorId: OTHER_MEMBER })),
    });
    const { service, checkRateLimit } = makeService(repository);

    const result = await service.reportComment(VIEWER, 'c1', 'spam');

    expect(result.id).toBe('r1');
    expect(checkRateLimit).toHaveBeenCalledWith(`post-comment-report:${VIEWER}`, 5, 5 * 60 * 1000);
    expect(repository.reportComment).toHaveBeenCalledWith('c1', VIEWER, 'spam');
  });

  it('answers a repeated report with 409 instead of a server failure', async () => {
    const repository = makeRepository({
      getComment: vi.fn(async () => comment({ authorId: OTHER_MEMBER })),
      reportComment: vi.fn(async () => null),
    });
    const { service } = makeService(repository);

    await expect(service.reportComment(VIEWER, 'c1', 'spam')).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('PostEngagementService comment ownership', () => {
  it('refuses to edit another member’s comment, and writes nothing', async () => {
    const repository = makeRepository({
      getComment: vi.fn(async () => comment({ authorId: OTHER_MEMBER })),
    });
    const { service } = makeService(repository);

    await expect(service.editComment(VIEWER, 'c1', 'نصّ')).rejects.toMatchObject({ status: 403 });
    expect(repository.updateComment).not.toHaveBeenCalled();
  });

  it('refuses to delete another member’s comment, and writes nothing', async () => {
    const repository = makeRepository({
      getComment: vi.fn(async () => comment({ authorId: OTHER_MEMBER })),
    });
    const { service } = makeService(repository);

    await expect(service.deleteComment(VIEWER, 'c1')).rejects.toMatchObject({ status: 403 });
    expect(repository.deleteComment).not.toHaveBeenCalled();
  });

  it('lets the post author remove another member’s reply', async () => {
    const repository = makeRepository({
      getComment: vi.fn(async () => comment({ authorId: OTHER_MEMBER })),
      postAuthor: vi.fn(async () => VIEWER),
      deleteComment: vi.fn(async () => ({ postId: POST_ID, commentCount: 2 })),
    });
    const { service } = makeService(repository);

    expect(await service.deleteComment(VIEWER, 'c1')).toEqual({ deleted: true, commentCount: 2 });
    expect(repository.deleteComment).toHaveBeenCalledWith('c1', VIEWER);
  });

  it('answers the count the tombstone reported', async () => {
    const repository = makeRepository({
      getComment: vi.fn(async () => comment()),
      deleteComment: vi.fn(async () => ({ postId: POST_ID, commentCount: 2 })),
    });
    const { service } = makeService(repository);

    expect(await service.deleteComment(VIEWER, 'c1')).toEqual({ deleted: true, commentCount: 2 });
  });
});
