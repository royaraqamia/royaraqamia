import { describe, it, expect, vi } from 'vitest';

import { CommentReportsAdminService } from '@/backend/services/community/comment-reports-admin-service';
import type { CommentReportsAdminRepository } from '@/backend/repositories/community/comment-reports-admin-repository';

function row() {
  return {
    id: 'r1',
    comment_id: 'c1',
    post_id: 'p1',
    reporter_id: 'u1',
    reason: 'spam',
    snapshot: {
      commentId: 'c1',
      body: 'تعليق',
      authorId: 'u2',
      createdAt: '2026-01-01T00:00:00Z',
      postId: 'p1',
      postSlug: 'a-post',
    },
    status: 'open',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('CommentReportsAdminService', () => {
  it('validates the frozen snapshot on the way out', async () => {
    const repository = {
      list: vi.fn(async () => [row()]),
      decide: vi.fn(async () => null),
    } as unknown as CommentReportsAdminRepository;
    const service = new CommentReportsAdminService(repository);

    const reports = await service.list('open');

    expect(reports).toHaveLength(1);
    expect(reports[0]?.snapshot.body).toBe('تعليق');
    expect(repository.list).toHaveBeenCalledWith('open', 100);
  });

  it('returns null when the report was already decided', async () => {
    const repository = {
      list: vi.fn(async () => []),
      decide: vi.fn(async () => null),
    } as unknown as CommentReportsAdminRepository;
    const service = new CommentReportsAdminService(repository);

    await expect(service.decide('r1', 'dismissed')).resolves.toBeNull();
  });
});
