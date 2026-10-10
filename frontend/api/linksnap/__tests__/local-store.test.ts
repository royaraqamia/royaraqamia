import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

function open(identity = GUEST_IDENTITY) {
  return LinksnapLocalStore.open(identity, factory);
}

describe('LinksnapLocalStore', () => {
  it('creates a link with a client-minted id and queues a create intent', async () => {
    const store = await open();
    const link = await store.createLink({ originalUrl: 'https://example.com/long' });

    expect(link.clientId).toMatch(UUID_RE);
    expect(link.code).toMatch(/^[a-zA-Z0-9]{6}$/);
    expect(await store.getLinks()).toHaveLength(1);

    const outbox = await store.getOutbox();
    expect(outbox.map((e) => e.type)).toEqual(['link.create']);
    expect(outbox[0]?.payload).toMatchObject({ clientId: link.clientId, code: link.code });
    store.close();
  });

  it('keeps a custom code and generates a fresh one when it collides locally', async () => {
    const store = await open();
    const first = await store.createLink({ originalUrl: 'https://a.com', customCode: 'promo' });
    const second = await store.createLink({ originalUrl: 'https://b.com', customCode: 'promo' });

    expect(first.code).toBe('promo');
    expect(second.code).not.toBe('promo');
    store.close();
  });

  it('tombstones a deleted link and hides it from reads', async () => {
    const store = await open();
    const link = await store.createLink({ originalUrl: 'https://example.com' });
    await store.deleteLink(link.clientId);

    expect(await store.getLinks()).toHaveLength(0);
    expect((await store.getOutbox()).at(-1)?.type).toBe('link.delete');
    store.close();
  });

  it('updates a link in place and queues an update with the previous code', async () => {
    const store = await open();
    const link = await store.createLink({
      originalUrl: 'https://example.com/a',
      customCode: 'slug-a',
    });
    await store.updateLink(link.clientId, {
      originalUrl: 'https://example.com/b',
      newCode: 'slug-b',
    });

    const [updated] = await store.getLinks();
    expect(updated?.code).toBe('slug-b');
    expect(updated?.originalUrl).toBe('https://example.com/b');
    const last = (await store.getOutbox()).at(-1);
    expect(last?.type).toBe('link.update');
    expect(last?.payload).toMatchObject({ code: 'slug-a', newCode: 'slug-b' });
    store.close();
  });

  it('restores a deleted link (resurrect) and re-shows it', async () => {
    const store = await open();
    const link = await store.createLink({ originalUrl: 'https://example.com' });
    await store.deleteLink(link.clientId);
    await store.restoreLink(link.clientId);

    expect(await store.getLinks()).toHaveLength(1);
    const last = (await store.getOutbox()).at(-1);
    expect(last?.type).toBe('link.update');
    expect(last?.payload).toMatchObject({ deletedAt: null });
    store.close();
  });

  it('merges server data last-write-wins but never clobbers a queued link', async () => {
    const store = await open(userIdentity('u-1'));
    const local = await store.createLink({
      originalUrl: 'https://local.com',
      customCode: 'local1',
    });

    await store.mergeServerData([
      {
        clientId: 'srv-1',
        code: 'srv1',
        originalUrl: 'https://server.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        isBlocked: false,
        passwordProtected: false,
        deletedAt: null,
      },
      {
        clientId: local.clientId,
        code: 'local1',
        originalUrl: 'https://stale-server.com',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        expiresAt: null,
        isBlocked: false,
        passwordProtected: false,
        deletedAt: null,
      },
    ]);

    const byKey = new Map((await store.getLinks()).map((l) => [l.clientId, l]));
    expect(byKey.get('srv-1')?.originalUrl).toBe('https://server.com');
    expect(byKey.get(local.clientId)?.originalUrl).toBe('https://local.com');
    store.close();
  });

  it('claims guest links and re-homes their intents onto the account', async () => {
    const guest = await open(GUEST_IDENTITY);
    const link = await guest.createLink({ originalUrl: 'https://guest.com' });
    guest.close();

    const account = await open(userIdentity('u-1'));
    const reopenedGuest = await open(GUEST_IDENTITY);
    await account.claimFrom(reopenedGuest);
    reopenedGuest.close();

    expect((await account.getLinks()).map((l) => l.clientId)).toContain(link.clientId);
    expect((await account.getOutbox()).map((e) => e.type)).toContain('link.create');
    account.close();
  });

  it('seeds once and never overwrites local writes', async () => {
    const store = await open(userIdentity('u-1'));
    await store.seedIfEmpty([
      {
        clientId: 'srv-1',
        code: 'srv1',
        originalUrl: 'https://server.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        isBlocked: false,
        passwordProtected: false,
        deletedAt: null,
      },
    ]);
    await store.createLink({ originalUrl: 'https://local.com' });

    await store.seedIfEmpty([]);
    expect(await store.getLinks()).toHaveLength(2);
    store.close();
  });

  it('re-arms failed intents for a retry and notifies subscribers', async () => {
    const store = await open();
    let calls = 0;
    const unsubscribe = store.subscribeWrites(() => {
      calls += 1;
    });
    await store.createLink({ originalUrl: 'https://example.com' });
    unsubscribe();
    const [entry] = await store.getOutbox();
    await store.patchOutbox(entry!.seq, { status: 'failed', lastError: 'boom' });
    await store.retryFailedOutbox();

    const [after] = await store.getOutbox();
    expect(after?.status).toBe('pending');
    expect(calls).toBe(1);
    store.close();
  });
});
