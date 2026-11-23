import { describe, expect, it, vi } from 'vitest';

import { storeGeneratedMedia } from '@/backend/services/chat/chat-app-media';

function deps() {
  return {
    apps: {
      fetchMedia: vi.fn(async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
      })),
    },
    attachments: { upload: vi.fn(async () => true) },
    userId: 'user-1',
    connectionId: 'conn-1',
    conversationId: 'conversation-1',
  };
}

describe('member-paid media from a connected app (ADR-0216)', () => {
  it('stores a declared file beside its MIME even when the link has no extension', async () => {
    const setup = deps();
    const outcome = await storeGeneratedMedia({
      ...setup,
      result: {
        isError: false,
        content: [],
        structured: {
          url: 'https://cdn.example/files/8e2f?signature=abc',
          mimeType: 'image/png',
        },
      },
    });

    expect(setup.apps.fetchMedia).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example/files/8e2f?signature=abc' })
    );
    expect(outcome.status).toBe('ok');
    expect(outcome.status === 'ok' && outcome.media).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
    });
    expect(setup.attachments.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^conversation-1\/generated\/.*\.png$/),
      expect.any(Uint8Array),
      'image/png'
    );
  });

  it('never follows a non-renderable or non-https answer', async () => {
    const setup = deps();
    const outcome = await storeGeneratedMedia({
      ...setup,
      result: {
        isError: false,
        content: [{ type: 'text', text: 'http://cdn.example/clip.mp4' }],
        structured: null,
      },
    });

    expect(outcome).toEqual({ status: 'none' });
    expect(setup.apps.fetchMedia).not.toHaveBeenCalled();
  });

  it('reports one failure when the vendor marks the call as an error', async () => {
    const setup = deps();
    await expect(
      storeGeneratedMedia({ ...setup, result: { isError: true, content: [], structured: null } })
    ).resolves.toEqual({ status: 'failed' });
    expect(setup.apps.fetchMedia).not.toHaveBeenCalled();
  });
});
