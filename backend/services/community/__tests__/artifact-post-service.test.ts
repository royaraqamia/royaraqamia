import { describe, expect, it, vi } from 'vitest';

import {
  ArtifactPostService,
  ArtifactUnavailableError,
  type ArtifactSourceReader,
} from '@/backend/services/community/artifact-post-service';
import type {
  BlogpressPostsService,
  PostDraftInput,
} from '@/backend/services/blogpress/posts-service';

function makeService(artifact: Awaited<ReturnType<ArtifactSourceReader['read']>>) {
  const read = vi.fn(async () => artifact);
  const createDraft = vi.fn(
    async (_authorId: string, _input: PostDraftInput): Promise<{ id: string }> => ({ id: 'p-1' })
  );

  const service = new ArtifactPostService({ read }, {
    createDraft,
  } as unknown as BlogpressPostsService);

  return { service, read, createDraft };
}

describe('ArtifactPostService', () => {
  it('creates a draft with the member as author and the source marker', async () => {
    const { service, createDraft } = makeService({
      body: '## عنوان الملاحظة\n\nنصّ الملاحظة',
      title: null,
    });

    const draft = await service.createDraft('u-1', 'note', 'n-1');

    expect(createDraft).toHaveBeenCalledWith('u-1', {
      slug: expect.stringMatching(/^post-[0-9a-f]{8}$/),
      content: '## عنوان الملاحظة\n\nنصّ الملاحظة',
      metaTitle: 'عنوان الملاحظة',
      source: { kind: 'note', ref: 'n-1' },
    });
    expect(draft).toEqual({
      id: 'p-1',
      slug: expect.stringMatching(/^post-[0-9a-f]{8}$/),
      content: '## عنوان الملاحظة\n\nنصّ الملاحظة',
      metaTitle: 'عنوان الملاحظة',
    });
  });

  it('reads an assistant answer through the same door', async () => {
    const { service, createDraft } = makeService({ body: 'جواب نور', title: null });

    await service.createDraft('u-1', 'answer', 'm-1');

    expect(createDraft).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ source: { kind: 'answer', ref: 'm-1' } })
    );
  });

  it('refuses a missing, deleted or empty artifact without writing a draft', async () => {
    for (const artifact of [null, { body: '   ', title: null }]) {
      const { service, createDraft } = makeService(artifact);

      await expect(service.createDraft('u-1', 'note', 'n-1')).rejects.toBeInstanceOf(
        ArtifactUnavailableError
      );
      expect(createDraft).not.toHaveBeenCalled();
    }
  });

  it('answers 404 so the route can say the artifact is gone', async () => {
    const { service } = makeService(null);

    await expect(service.createDraft('u-1', 'note', 'n-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'artifact_unavailable',
    });
  });

  it('caps the derived title at the composer’s limit', async () => {
    const { service, createDraft } = makeService({
      body: `${'ط'.repeat(100)}\n\nبقية النصّ`,
      title: null,
    });

    await service.createDraft('u-1', 'note', 'n-1');

    const input = createDraft.mock.calls[0]![1] as { metaTitle: string };
    expect(input.metaTitle).toHaveLength(70);
  });
});
