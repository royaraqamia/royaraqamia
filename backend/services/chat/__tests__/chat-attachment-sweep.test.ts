import { describe, expect, it, vi } from 'vitest';

import {
  CHAT_ATTACHMENT_ORPHAN_AGE_MS,
  ChatAttachmentSweepService,
  orphanedAttachmentPaths,
} from '@/backend/services/chat/chat-attachment-sweep';
import type { ChatAttachmentSweepRepository } from '@/backend/repositories/chat/chat-attachment-sweep-repository';

const now = Date.parse('2026-11-02T03:30:00.000Z');
const old = new Date(now - CHAT_ATTACHMENT_ORPHAN_AGE_MS - 60_000).toISOString();
const fresh = new Date(now - 60_000).toISOString();

describe('orphanedAttachmentPaths', () => {
  it('keeps what a row still claims, whatever its age', () => {
    expect(
      orphanedAttachmentPaths(
        [{ path: 'c-1/u-1/a.pdf', updatedAt: old }],
        new Set(['c-1/u-1/a.pdf']),
        now
      )
    ).toEqual([]);
  });

  it('removes an unclaimed object older than the window', () => {
    expect(
      orphanedAttachmentPaths([{ path: 'c-1/u-1/a.pdf', updatedAt: old }], new Set(), now)
    ).toEqual(['c-1/u-1/a.pdf']);
  });

  it('keeps an unclaimed object that could still be an upload in flight', () => {
    expect(
      orphanedAttachmentPaths([{ path: 'c-1/u-9/a.pdf', updatedAt: fresh }], new Set(), now)
    ).toEqual([]);
  });

  it('keeps an object storage gave no timestamp for', () => {
    expect(
      orphanedAttachmentPaths([{ path: 'c-1/u-9/a.pdf', updatedAt: null }], new Set(), now)
    ).toEqual([]);
  });
});

describe('ChatAttachmentSweepService', () => {
  it('removes the orphans and reports what it read', async () => {
    const removeObjects = vi.fn(async () => undefined);
    const repo: ChatAttachmentSweepRepository = {
      listReferencedPaths: vi.fn(async () => new Set(['c-1/u-1/kept.pdf'])),
      listObjects: vi.fn(async () => ({
        objects: [
          { path: 'c-1/u-1/kept.pdf', updatedAt: old },
          { path: 'c-1/u-2/lost.pdf', updatedAt: old },
        ],
        truncated: false,
      })),
      removeObjects,
    };

    const result = await new ChatAttachmentSweepService(repo).run(now);

    expect(removeObjects).toHaveBeenCalledWith(['c-1/u-2/lost.pdf']);
    expect(result).toEqual({ scanned: 2, removed: 1, truncated: false });
  });
});
