import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatAgentTool, type ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import {
  createPostCommentHandler,
  deletePostCommentHandler,
  deletePostHandler,
  listPostCommentsHandler,
  setPostLikeHandler,
} from '@/backend/services/mcp/tools/blogpress';
import { getProfileHandler, updateProfileHandler } from '@/backend/services/mcp/tools/profile';
import { chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';
import { toolsDepsFor } from '@/backend/services/chat/__tests__/support/tools-deps';

/**
 * The last three product packs of phase 3 (issue #1433). The turn and the MCP
 * door call the same handlers and read their `structuredContent`, so a like or
 * a comment cannot answer differently by door (ADR-0183's amendment).
 */

vi.mock('@/backend/services/mcp/tools/blogpress', () => ({
  createPostCommentHandler: vi.fn(),
  deletePostCommentHandler: vi.fn(),
  deletePostHandler: vi.fn(),
  editPostCommentHandler: vi.fn(),
  listPostCommentsHandler: vi.fn(),
  setPostLikeHandler: vi.fn(),
  unpublishPostHandler: vi.fn(),
}));

vi.mock('@/backend/services/mcp/tools/profile', () => ({
  getProfileHandler: vi.fn(),
  updateProfileHandler: vi.fn(),
}));

// Product-service fakes, handed to the catalogue through `ChatAgentToolsDeps`.
const createCertificatesRepository = vi.fn();
const verifyCertificateByCode = vi.fn();
const createPostsRepository = vi.fn();
const deps = toolsDepsFor({
  certificates: {
    createRepository: createCertificatesRepository,
    verifyByCode: verifyCertificateByCode,
  },
  posts: {
    createRepository: createPostsRepository,
    createService: () => {
      throw new Error('The community tool suite does not create drafts through the service');
    },
  },
});

function turnContext(): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1', deps };
}

function answer(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: '# markdown' }], structuredContent: value };
}

const certificates = {
  listByRecipient: vi.fn(async () => [] as Array<Record<string, unknown>>),
};

const posts = {
  getPostForUser: vi.fn(async () => null as { id: string } | null),
};

beforeEach(() => {
  vi.clearAllMocks();
  certificates.listByRecipient.mockResolvedValue([]);
  posts.getPostForUser.mockResolvedValue(null);
  vi.mocked(createCertificatesRepository).mockReturnValue(certificates as never);
  vi.mocked(createPostsRepository).mockReturnValue(posts as never);
});

describe('the account profile (issue #1433)', () => {
  it('answers "what is my username" from the profile, without the admin flag', async () => {
    vi.mocked(getProfileHandler).mockResolvedValue(
      answer({
        id: 'user-1',
        name: 'ريم',
        username: 'reem',
        email: 'reem@example.com',
        avatar_url: 'https://example.test/a.png',
        bio: 'مطوّرة',
        is_admin: true,
      })
    );

    const result = await chatAgentTool('get_profile')!.run({}, turnContext());
    expect(result).toEqual({
      email: 'reem@example.com',
      name: 'ريم',
      username: 'reem',
      avatar_url: 'https://example.test/a.png',
      bio: 'مطوّرة',
    });
    expect(result).not.toHaveProperty('is_admin');
    expect(vi.mocked(getProfileHandler).mock.calls[0]![1].scopes).toEqual(['profile.read']);
  });

  it('writes only the profile fields the site allows', async () => {
    vi.mocked(updateProfileHandler).mockResolvedValue(
      answer({ name: 'ريم', bio: null, avatar_url: null })
    );

    await chatAgentTool('update_profile')!.run({ bio: 'مطوّرة' }, turnContext());
    expect(vi.mocked(updateProfileHandler).mock.calls[0]![0]).toEqual({
      bio: 'مطوّرة',
      format: 'json',
    });
    expect(vi.mocked(updateProfileHandler).mock.calls[0]![1].scopes).toEqual(['profile.write']);

    await expect(
      chatAgentTool('update_profile')!.run({ is_admin: true }, turnContext())
    ).rejects.toThrow();
  });
});

describe('the certificate reads (issue #1433)', () => {
  it('verifies through the public verifier with the turn’s address', async () => {
    const verdict = { success: true, certificate: { certificate_code: 'COMP-2026-A1B2C3D4' } };
    vi.mocked(verifyCertificateByCode).mockResolvedValue(verdict as never);

    expect(
      await chatAgentTool('verify_certificate')!.run({ code: 'COMP-2026-A1B2C3D4' }, turnContext())
    ).toEqual(verdict);
    expect(verifyCertificateByCode).toHaveBeenCalledWith('COMP-2026-A1B2C3D4', '127.0.0.1');
  });

  it('gets only a certificate the member received', async () => {
    certificates.listByRecipient.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        certificate_code: 'COMP-2026-A1B2C3D4',
        student_name: 'ريم',
        course_name: 'تصميم',
        issue_date: '2026-01-01',
        expiration_date: null,
        grade_or_status: 'ممتاز',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const id = '11111111-1111-4111-8111-111111111111';
    const result = await chatAgentTool('get_certificate')!.run({ id }, turnContext());
    expect(result).toMatchObject({
      found: true,
      certificate: { certificate_code: 'COMP-2026-A1B2C3D4' },
    });
    expect(result).not.toHaveProperty('certificate.recipient_user_ids');
    expect(certificates.listByRecipient).toHaveBeenCalledWith('user-1');

    expect(
      await chatAgentTool('get_certificate')!.run(
        { id: '22222222-2222-4222-8222-222222222222' },
        turnContext()
      )
    ).toEqual({ found: false });
  });
});

describe('community engagement (issue #1433)', () => {
  it('reads the public keyset page the post page reads', async () => {
    const page = { comments: [], nextCursor: null, total: 0 };
    vi.mocked(listPostCommentsHandler).mockResolvedValue(answer(page));

    expect(
      await chatAgentTool('list_post_comments')!.run(
        { slug: 'how-to-start', cursor: 'opaque' },
        turnContext()
      )
    ).toEqual(page);
    expect(vi.mocked(listPostCommentsHandler).mock.calls[0]![0]).toEqual({
      slug: 'how-to-start',
      cursor: 'opaque',
      format: 'json',
    });
    expect(vi.mocked(listPostCommentsHandler).mock.calls[0]![1].scopes).toEqual(['community.read']);
  });

  it('sets a like to the state asked for, so a retry cannot toggle it back', async () => {
    const verdict = { liked: true, likeCount: 7 };
    vi.mocked(setPostLikeHandler).mockResolvedValue(answer(verdict));

    const tool = chatAgentTool('set_post_like')!;
    expect(await tool.run({ slug: 'how-to-start', liked: true }, turnContext())).toEqual(verdict);
    expect(await tool.run({ slug: 'how-to-start', liked: true }, turnContext())).toEqual(verdict);

    for (const call of vi.mocked(setPostLikeHandler).mock.calls) {
      expect(call[0]).toEqual({ slug: 'how-to-start', liked: true, format: 'json' });
      expect(call[1].userId).toBe('user-1');
      expect(call[1].scopes).toEqual(['community.write']);
    }
  });

  it('writes a comment as the caller and refuses an author argument', async () => {
    const created = {
      comment: { id: 'c1', postId: 'p1', body: 'مفيد', author: { id: 'user-1' } },
      commentCount: 1,
    };
    vi.mocked(createPostCommentHandler).mockResolvedValue(answer(created));

    expect(
      await chatAgentTool('create_post_comment')!.run(
        { slug: 'how-to-start', body: 'مفيد' },
        turnContext()
      )
    ).toEqual(created);

    const [params, ctx] = vi.mocked(createPostCommentHandler).mock.calls[0]!;
    expect(params).toEqual({ slug: 'how-to-start', body: 'مفيد', format: 'json' });
    expect(params).not.toHaveProperty('authorId');
    expect((ctx as { userId: string }).userId).toBe('user-1');
  });

  it('does not forward the card-only body of a comment delete', async () => {
    vi.mocked(deletePostCommentHandler).mockResolvedValue(
      answer({ deleted: true, commentCount: 0 })
    );

    await chatAgentTool('delete_post_comment')!.run({ id: 'c1', body: 'مفيد' }, turnContext());
    expect(vi.mocked(deletePostCommentHandler).mock.calls[0]![0]).toEqual({
      id: 'c1',
      format: 'json',
    });
  });

  it('checks ownership before deleting a post', async () => {
    vi.mocked(deletePostHandler).mockResolvedValue(answer({ id: 'p1', slug: 'how-to-start' }));

    expect(
      await chatAgentTool('delete_post')!.run(
        { id: '11111111-1111-4111-8111-111111111111', slug: 'how-to-start' },
        turnContext()
      )
    ).toHaveProperty('error');
    expect(deletePostHandler).not.toHaveBeenCalled();

    posts.getPostForUser.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    expect(
      await chatAgentTool('delete_post')!.run(
        { id: '11111111-1111-4111-8111-111111111111', slug: 'how-to-start' },
        turnContext()
      )
    ).toEqual({ id: 'p1', slug: 'how-to-start' });
    expect(posts.getPostForUser).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'user-1'
    );
  });

  it('names the target on the cards that can change a thread', () => {
    expect(
      chatAgentActionSentence('set_post_like', { slug: 'how-to-start', liked: true })
    ).toContain('how-to-start');
    expect(chatAgentActionSentence('create_post_comment', { body: 'مفيد جداً' })).toContain(
      'مفيد جداً'
    );
    expect(chatAgentActionSentence('delete_post_comment', { body: 'مفيد جداً' })).toContain(
      'مفيد جداً'
    );
    expect(chatAgentActionSentence('delete_post', { slug: 'how-to-start' })).toContain(
      'how-to-start'
    );
  });
});
