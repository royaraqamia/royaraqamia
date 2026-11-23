import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpUserContext } from '../session';
import type { McpScope } from '../scope';
import { createPostEngagementService } from '@/backend/config/community';

/**
 * The MCP half of Community's engagement hands (issue #1433). Every write goes
 * through createPostEngagementService: service_role writes and per-member limits
 * live in the service, never in a tool. The handlers only carry the caller the
 * auth layer resolved, so a client cannot name another member's comment.
 */

vi.mock('@/backend/config/community', () => ({ createPostEngagementService: vi.fn() }));

const engagement = {
  thread: vi.fn(async () => ({ comments: [], nextCursor: null, total: 0 })),
  setLike: vi.fn(async () => ({ liked: true, likeCount: 7 })),
  comment: vi.fn(async () => ({
    comment: { id: 'c1', postId: 'p1', body: 'مفيد', author: { id: 'u1' } },
    commentCount: 1,
  })),
  editComment: vi.fn(async () => ({ comment: { id: 'c1', body: 'مفيد جداً' } })),
  deleteComment: vi.fn(async () => ({ deleted: true, commentCount: 0 })),
};

function ctx(scopes: McpScope[] = ['community.read', 'community.write']): McpUserContext {
  return {
    userId: 'u1',
    email: 'user@example.com',
    isAdmin: false,
    scopes,
    clientId: null,
    tokenExpiresAt: null,
    supabase: {} as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  engagement.thread.mockResolvedValue({ comments: [], nextCursor: null, total: 0 });
  engagement.setLike.mockResolvedValue({ liked: true, likeCount: 7 });
  engagement.comment.mockResolvedValue({
    comment: { id: 'c1', postId: 'p1', body: 'مفيد', author: { id: 'u1' } },
    commentCount: 1,
  });
  engagement.editComment.mockResolvedValue({ comment: { id: 'c1', body: 'مفيد جداً' } });
  engagement.deleteComment.mockResolvedValue({ deleted: true, commentCount: 0 });
  vi.mocked(createPostEngagementService).mockReturnValue(engagement as never);
});

describe('community engagement handlers', () => {
  it('reads one public keyset page through the service', async () => {
    const { listPostCommentsHandler } = await import('../tools/blogpress');
    const page = { comments: [], nextCursor: 'next', total: 4 };
    engagement.thread.mockResolvedValue(page as never);

    const result = await listPostCommentsHandler(
      { slug: 'how-to-start', cursor: 'opaque', format: 'json' },
      ctx(['community.read'])
    );
    expect(result.structuredContent).toEqual(page);
    expect(engagement.thread).toHaveBeenCalledWith('how-to-start', 'opaque', 20, 'u1');
  });

  it('sets a like, never toggles one, and answers the new count', async () => {
    const { setPostLikeHandler } = await import('../tools/blogpress');
    const first = await setPostLikeHandler(
      { slug: 'how-to-start', liked: true, format: 'json' },
      ctx()
    );
    const retry = await setPostLikeHandler(
      { slug: 'how-to-start', liked: true, format: 'json' },
      ctx()
    );

    expect(first.structuredContent).toEqual({ liked: true, likeCount: 7 });
    expect(retry.structuredContent).toEqual({ liked: true, likeCount: 7 });
    expect(engagement.setLike).toHaveBeenCalledTimes(2);
    expect(engagement.setLike).toHaveBeenNthCalledWith(1, 'u1', 'how-to-start', true);
    expect(engagement.setLike).toHaveBeenNthCalledWith(2, 'u1', 'how-to-start', true);
  });

  it('names the caller as a comment’s author and cannot be given another', async () => {
    const { createPostCommentHandler } = await import('../tools/blogpress');
    const result = await createPostCommentHandler(
      { slug: 'how-to-start', body: 'مفيد', format: 'json' },
      ctx()
    );

    expect(result.structuredContent).toMatchObject({
      comment: { author: { id: 'u1' } },
      commentCount: 1,
    });
    expect(engagement.comment).toHaveBeenCalledWith('u1', 'how-to-start', 'مفيد');

    // The strict input schema is the door's guard: a client that tries to name
    // an author is refused before the handler, which only knows ctx.userId.
    const { createMcpServer } = await import('../tools/registry');
    const registered = createMcpServer(ctx()) as unknown as {
      _registeredTools: Record<
        string,
        { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }
      >;
    };
    const schema = registered._registeredTools.royaraqamia_community_create_comment!.inputSchema;
    expect(schema.safeParse({ slug: 'how-to-start', body: 'مفيد', format: 'json' }).success).toBe(
      true
    );
    expect(
      schema.safeParse({
        slug: 'how-to-start',
        body: 'مفيد',
        authorId: 'u2',
        format: 'json',
      }).success
    ).toBe(false);
  });

  it('edits and deletes only through the caller’s own id', async () => {
    const { editPostCommentHandler, deletePostCommentHandler } = await import('../tools/blogpress');

    const edited = await editPostCommentHandler(
      { id: 'c1', body: 'مفيد جداً', format: 'json' },
      ctx()
    );
    expect(edited.structuredContent).toMatchObject({ comment: { id: 'c1' } });
    expect(engagement.editComment).toHaveBeenCalledWith('u1', 'c1', 'مفيد جداً');

    const deleted = await deletePostCommentHandler({ id: 'c1', format: 'json' }, ctx());
    expect(deleted.structuredContent).toEqual({ deleted: true, commentCount: 0 });
    expect(engagement.deleteComment).toHaveBeenCalledWith('u1', 'c1');
  });

  it('refuses a write without the community.write scope', async () => {
    const { setPostLikeHandler } = await import('../tools/blogpress');
    const result = await setPostLikeHandler(
      { slug: 'how-to-start', liked: true, format: 'json' },
      ctx(['community.read'])
    );
    expect(result.isError).toBe(true);
    expect(engagement.setLike).not.toHaveBeenCalled();
  });
});
