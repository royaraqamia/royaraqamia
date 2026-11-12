import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_MESSAGE_WINDOW,
  CHAT_RETENTION_MS,
  CHAT_THREAD_WINDOW,
  ChatsLocalStore,
  localAttachmentMediaKey,
  outboxMediaKey,
  type ChatSendIntent,
  type StoredMedia,
} from '@/frontend/api/chats/local-store';
import { GUEST_IDENTITY } from '@/frontend/shared/local-store/identity';
import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

function open(identity = GUEST_IDENTITY) {
  return ChatsLocalStore.open(identity, factory);
}

function thread(id: string, lastMessageAt: string): ChatThread {
  return {
    id,
    kind: 'direct',
    status: 'active',
    title: id,
    counterpart: null,
    myStatus: 'active',
    lastMessage: null,
    unreadCount: 0,
    openActions: 0,
    lastMessageAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    participants: [],
    me: null,
    blockedByMe: false,
    canWrite: true,
    attachmentQuota: {
      fileBytes: 1_000,
      today: { usedBytes: 0, limitBytes: 10_000 },
      total: { usedBytes: 0, limitBytes: 100_000 },
      project: { usedBytes: 0, limitBytes: 500_000 },
    },
  };
}

function message(conversationId: string, id: string, createdAt: string): ChatMessage {
  return {
    id,
    conversationId,
    senderId: 'u-1',
    senderKind: 'user',
    body: id,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
    attachments: [],
    replyTo: null,
  };
}

/** `n` messages, one minute apart, starting at `from`. */
function messages(conversationId: string, n: number, from = Date.UTC(2026, 10, 1)): ChatMessage[] {
  return Array.from({ length: n }, (_unused, index) =>
    message(conversationId, `m-${index}`, new Date(from + index * 60_000).toISOString())
  );
}

describe('ChatsLocalStore', () => {
  it('keeps the list newest first and holds only the window', async () => {
    const store = await open();

    const rows = Array.from({ length: CHAT_THREAD_WINDOW + 3 }, (_unused, index) =>
      thread(`c-${index}`, new Date(Date.UTC(2026, 10, 1, index)).toISOString())
    );
    // Shuffled on purpose: the store sorts, the caller does not have to.
    await store.saveThreads([...rows].reverse());

    const cached = await store.getThreads();
    expect(cached).toHaveLength(CHAT_THREAD_WINDOW);
    expect(cached[0]?.id).toBe(`c-${CHAT_THREAD_WINDOW + 2}`);

    const all = await store.getThread(`c-0`);
    expect(all).toBeNull();
  });

  it('holds the newest messages of a thread, oldest first', async () => {
    const store = await open();
    const page = messages('c-1', CHAT_MESSAGE_WINDOW + 10);

    await store.saveMessages('c-1', page);

    const cached = await store.getMessages('c-1');
    expect(cached).toHaveLength(CHAT_MESSAGE_WINDOW);
    expect(cached[0]?.id).toBe('m-10');
    expect(cached.at(-1)?.id).toBe(`m-${CHAT_MESSAGE_WINDOW + 9}`);
  });

  it('replaces the cached window with the server page, and keeps older pages', async () => {
    const store = await open();
    const first = messages('c-1', 3);
    await store.saveMessages('c-1', first);

    const later = messages('c-1', 3, Date.UTC(2026, 10, 2));
    await store.saveMessages('c-1', later, { replace: true });

    expect((await store.getMessages('c-1')).map((row) => row.id)).toEqual(
      later.map((row) => row.id)
    );

    const older = [message('c-1', 'm-old', '2026-10-31T00:00:00.000Z')];
    await store.saveMessages('c-1', older);

    const all = await store.getMessages('c-1');
    expect(all[0]?.id).toBe('m-old');
    expect(all).toHaveLength(4);
  });

  it("never serves the list's row as a thread header", async () => {
    // A summary and a thread share an id but not a shape; drawing the summary
    // as the open thread is a missing `participants` (#1033's production bug).
    const store = await open();
    await store.saveThreads([thread('c-1', '2026-11-01T10:00:00.000Z')]);

    expect(await store.getThread('c-1')).toBeNull();

    await store.saveThread(thread('c-1', '2026-11-01T10:00:00.000Z'));

    const header = await store.getThread('c-1');
    expect(header?.participants).toEqual([]);
    expect(header?.canWrite).toBe(true);
  });

  it('keeps one thread out of another', async () => {
    const store = await open();
    await store.saveMessages('c-1', messages('c-1', 2));
    await store.saveMessages('c-2', messages('c-2', 2, Date.UTC(2026, 9, 1)));

    expect((await store.getMessages('c-1')).every((row) => row.conversationId === 'c-1')).toBe(
      true
    );
    expect(await store.getMessages('c-2')).toHaveLength(2);
  });

  it('sweeps what is older than the retention window', async () => {
    const store = await open();
    const now = Date.UTC(2026, 11, 1);
    const stale = new Date(now - CHAT_RETENTION_MS - 86_400_000).toISOString();
    const fresh = new Date(now - 60_000).toISOString();

    await store.saveThreads([thread('stale', stale), thread('fresh', fresh)]);
    await store.saveThread(thread('stale', stale));
    await store.saveThread(thread('fresh', fresh));
    await store.saveMessages('stale', [message('stale', 'm-stale', stale)]);
    await store.saveMessages('fresh', [message('fresh', 'm-fresh', fresh)]);

    await store.prune(now);

    expect(await store.getThread('stale')).toBeNull();
    expect(await store.getMessages('stale')).toEqual([]);
    expect(await store.getThread('fresh')).not.toBeNull();
    expect(await store.getMessages('fresh')).toHaveLength(1);
  });

  it('empties every store on clear, which is the sign-out purge', async () => {
    const store = await open();
    await store.saveThreads([thread('c-1', '2026-11-01T10:00:00.000Z')]);
    await store.saveMessages('c-1', messages('c-1', 2));

    await store.clear();

    expect(await store.getThreads()).toEqual([]);
    expect(await store.getMessages('c-1')).toEqual([]);
  });
});

/**
 * The outbound queue (#1033): the line and its replay intent commit together, so
 * a queued write cannot be lost or sent twice, and the list's preview moves with
 * it while the connection is still away.
 */
describe('ChatsLocalStore queue', () => {
  it('commits the line and its intent in one write', async () => {
    const store = await open();

    const message = await store.enqueueMessage({
      conversationId: 'c-1',
      body: 'مرحبا',
      senderId: 'u-1',
    });

    expect(message.clientId).toBe(message.id);
    expect((await store.getMessages('c-1')).map((row) => row.id)).toEqual([message.id]);

    const outbox = await store.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      entity: 'chat_message',
      type: 'message.send',
      payload: { conversationId: 'c-1', body: 'مرحبا', clientId: message.clientId },
    });
    expect(await store.pendingStates()).toEqual({ [message.clientId!]: 'queued' });
  });

  it('swaps the server row in for the queued copy', async () => {
    const store = await open();
    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: 'مرحبا',
      senderId: 'u-1',
    });

    await store.applyServerMessage({
      ...queued,
      id: 'm-1',
      createdAt: '2026-11-01T10:05:00.000Z',
    });

    const rows = await store.getMessages('c-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('m-1');
  });

  it('reports a refused intent as failed, and re-arms it on retry', async () => {
    const store = await open();
    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: 'مرحبا',
      senderId: 'u-1',
    });

    const [entry] = await store.getOutbox();
    await store.patchOutbox(entry!.seq, { status: 'failed', lastError: 'blocked' });
    expect((await store.pendingStates())[queued.clientId!]).toBe('failed');

    await store.retryFailedOutbox();
    const [armed] = await store.getOutbox();
    expect(armed).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
    expect((await store.pendingStates())[queued.clientId!]).toBe('queued');
  });

  it("moves the cached thread's preview with the queued line", async () => {
    const store = await open();
    await store.saveThreads([thread('c-1', '2026-11-01T10:00:00.000Z')]);

    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: 'مرحبا',
      senderId: 'u-1',
    });

    const [cached] = (await store.getThreads()).filter((row) => row.id === 'c-1');
    expect(cached?.lastMessage?.body).toBe('مرحبا');
    expect(cached?.lastMessageAt).toBe(queued.createdAt);
  });

  it('drops the queue on the sign-out purge', async () => {
    const store = await open();
    await store.enqueueMessage({ conversationId: 'c-1', body: 'مرحبا', senderId: 'u-1' });

    await store.clear();

    expect(await store.getOutbox()).toEqual([]);
  });
});

/** One stored copy, for the budget tests. */
function mediaRow(key: string, bytes: number, lastUsedAt: number): StoredMedia {
  return {
    key,
    clientId: null,
    conversationId: 'c-1',
    fileName: `${key}.bin`,
    mimeType: 'application/octet-stream',
    bytes,
    blob: new Blob([new Uint8Array(bytes)]),
    kind: 'attachment',
    storedAt: lastUsedAt,
    lastUsedAt,
  };
}

/**
 * A `node:buffer` Blob on purpose: jsdom's own Blob does not survive
 * `fake-indexeddb`'s structured clone, and the point of this suite is the bytes
 * that come back, not the realm that made them.
 */
function fileOf(
  contents: string,
  name = 'a.pdf'
): { blob: Blob; fileName: string; mimeType: string } {
  return {
    blob: new NodeBlob([contents]) as unknown as Blob,
    fileName: name,
    mimeType: 'application/pdf',
  };
}

/**
 * Attachment bytes (#1033): a queued line owns its files as durably as it owns
 * its sentence, and the account's 250 MB wall is spent oldest-use first.
 */
describe('ChatsLocalStore media', () => {
  it('writes the file with the line, and names it in the intent', async () => {
    const store = await open();

    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: '',
      senderId: 'u-1',
      attachments: [fileOf('abc')],
    });

    const [attachment] = queued.attachments;
    expect(attachment?.fileName).toBe('a.pdf');
    expect(attachment?.byteSize).toBe(3);
    expect(attachment?.id.startsWith('local:')).toBe(true);

    const key = localAttachmentMediaKey(attachment!.id)!;
    expect(key).toBe(outboxMediaKey(queued.clientId!, 0));
    expect(await (await store.getMedia(key))?.text()).toBe('abc');

    const [entry] = await store.getOutbox();
    expect((entry?.payload as ChatSendIntent).attachments?.[0]).toMatchObject({
      key,
      fileName: 'a.pdf',
      byteSize: 3,
    });
  });

  it('drops the queued bytes once the server has the row', async () => {
    const store = await open();
    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: '',
      senderId: 'u-1',
      attachments: [fileOf('abc')],
    });
    const key = localAttachmentMediaKey(queued.attachments[0]!.id)!;

    await store.applyServerMessage({ ...queued, id: 'm-1' });

    expect(await store.getMedia(key)).toBeNull();
  });

  it('evicts the least recently used copy to stay inside the budget', async () => {
    const store = await open();
    await store.saveMedia(mediaRow('a', 6, 1));

    await store.saveMedia(mediaRow('b', 6, 2), { budget: 10 });

    expect(await store.getMedia('a')).toBeNull();
    expect(await store.getMedia('b')).not.toBeNull();
  });

  it('never evicts bytes a queued line has not uploaded yet', async () => {
    const store = await open();
    await store.saveMedia(mediaRow('old', 6, 1));
    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: '',
      senderId: 'u-1',
      attachments: [fileOf('123456')],
    });
    const key = localAttachmentMediaKey(queued.attachments[0]!.id)!;

    await store.saveMedia(mediaRow('new', 6, 3), { budget: 10 });

    expect(await store.getMedia(key)).not.toBeNull();
    expect(await store.getMedia('old')).toBeNull();
  });

  it('sweeps aged bytes with the retention window, and drops them on sign-out', async () => {
    const store = await open();
    const now = Date.UTC(2026, 11, 1);
    const stale = now - CHAT_RETENTION_MS - 86_400_000;
    await store.saveMedia(mediaRow('stale', 4, stale));
    await store.saveMedia(mediaRow('fresh', 4, now));

    // Queued bytes are the member's write, not an expired copy: the line is
    // older than the window on purpose, and its file still goes up.
    const queued = await store.enqueueMessage({
      conversationId: 'c-1',
      body: '',
      senderId: 'u-1',
      attachments: [fileOf('1234')],
    });
    const key = localAttachmentMediaKey(queued.attachments[0]!.id)!;

    await store.prune(now);

    expect(await store.getMedia('stale')).toBeNull();
    expect(await store.getMedia('fresh')).not.toBeNull();
    expect(await store.getMedia(key)).not.toBeNull();

    await store.clear();
    expect(await store.getMedia('fresh')).toBeNull();
  });
});
