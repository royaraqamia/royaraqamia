import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatsLocalStore } from '@/frontend/api/chats/local-store';
import {
  CHAT_PREFETCH_LIMIT,
  attachmentMediaKey,
  cacheChatAttachment,
  prefetchChatAttachments,
} from '@/frontend/api/chats/media-cache';
import type { ChatAttachment, ChatMessage } from '@/shared/contracts/chat';

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

function open() {
  return ChatsLocalStore.open('user:u-1', factory);
}

function attachment(id: string): ChatAttachment {
  return { id, fileName: `${id}.png`, mimeType: 'image/png', byteSize: 3 };
}

function message(id: string, attachments: ChatAttachment[]): ChatMessage {
  return {
    id,
    conversationId: 'c-1',
    senderId: 'u-1',
    senderKind: 'user',
    body: null,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: `2026-11-01T10:${String(id).padStart(2, '0')}:00.000Z`,
    attachments,
    replyTo: null,
  };
}

/** A `fetch` that answers bytes without a Response, so jsdom's realm stays out of it. */
function bytesFetcher(contents = 'abc') {
  const fetcher = vi.fn(async (_url: string) => ({
    ok: true,
    blob: async () => new NodeBlob([contents]) as unknown as Blob,
  }));
  return fetcher as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe('cacheChatAttachment', () => {
  it('keeps the bytes a member opened, under the attachment id', async () => {
    const store = await open();
    const file = attachment('a-1');
    const fetcher = bytesFetcher();

    const blob = await cacheChatAttachment(store, 'c-1', file, 'https://cdn/a-1', { fetcher });

    expect(blob).not.toBeNull();
    expect(fetcher.mock.calls).toHaveLength(1);

    const cached = await store.getMedia(attachmentMediaKey('a-1'));
    expect(cached).not.toBeNull();
    expect(await cached?.text()).toBe('abc');
  });

  it('leaves the cache as it was when the download fails', async () => {
    const store = await open();
    const fetcher = vi.fn(async () => ({ ok: false, blob: async () => new NodeBlob([]) }));

    const blob = await cacheChatAttachment(store, 'c-1', attachment('a-1'), 'https://cdn/a-1', {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(blob).toBeNull();
    expect(await store.getMedia(attachmentMediaKey('a-1'))).toBeNull();
  });
});

describe('prefetchChatAttachments', () => {
  it('prefetches nothing on a metered connection', async () => {
    const store = await open();
    const fetcher = bytesFetcher();
    const loadUrl = vi.fn(async () => 'https://cdn/a-1');

    const fetched = await prefetchChatAttachments(
      store,
      'c-1',
      [message('m-1', [attachment('a-1')])],
      loadUrl,
      { fetcher, isMetered: () => true }
    );

    expect(fetched).toBe(0);
    expect(fetcher.mock.calls).toHaveLength(0);
    expect(loadUrl).not.toHaveBeenCalled();
  });

  it('prefetches nothing while the browser says it is offline', async () => {
    const store = await open();
    const fetcher = bytesFetcher();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const fetched = await prefetchChatAttachments(
      store,
      'c-1',
      [message('m-1', [attachment('a-1')])],
      async () => 'https://cdn/a-1',
      { fetcher, isMetered: () => false }
    );

    online.mockRestore();
    expect(fetched).toBe(0);
    expect(fetcher.mock.calls).toHaveLength(0);
  });

  it('takes the newest files first, and stops at the limit', async () => {
    const store = await open();
    const fetcher = bytesFetcher();
    const messages = Array.from({ length: CHAT_PREFETCH_LIMIT + 2 }, (_unused, index) =>
      message(`m-${String(index).padStart(2, '0')}`, [attachment(`a-${index}`)])
    );
    const loadUrl = vi.fn(async (id: string) => `https://cdn/${id}`);

    const fetched = await prefetchChatAttachments(store, 'c-1', messages, loadUrl, {
      fetcher,
      isMetered: () => false,
    });

    expect(fetched).toBe(CHAT_PREFETCH_LIMIT);
    // The newest two messages are the ones left out, not the oldest.
    const cached = await store.getMedia(attachmentMediaKey('a-0'));
    expect(cached).toBeNull();
    expect(await store.getMedia(attachmentMediaKey(`a-${CHAT_PREFETCH_LIMIT}`))).not.toBeNull();
  });

  it('never downloads a file the device already holds', async () => {
    const store = await open();
    const fetcher = bytesFetcher();
    await cacheChatAttachment(store, 'c-1', attachment('a-1'), 'https://cdn/a-1', { fetcher });
    fetcher.mock.calls.length = 0;

    const fetched = await prefetchChatAttachments(
      store,
      'c-1',
      [message('m-1', [attachment('a-1')])],
      async () => 'https://cdn/a-1',
      { fetcher, isMetered: () => false }
    );

    expect(fetched).toBe(0);
    expect(fetcher.mock.calls).toHaveLength(0);
  });
});
