import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Note } from '@/shared/contracts/notes';
import { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

function open(identity = GUEST_IDENTITY) {
  return NotesLocalStore.open(identity, factory);
}

function serverNote(overrides: Partial<Note> & { id: string }): Note {
  return {
    clientId: overrides.id,
    title: 'من الخادم',
    body: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('NotesLocalStore', () => {
  it('creates a note with a client-minted id and queues a create intent', async () => {
    const store = await open();
    const note = await store.createNote();

    expect(note.id).toMatch(UUID_RE);
    expect(note.clientId).toBe(note.id);
    expect(note.deletedAt).toBeNull();
    expect(await store.getNotes()).toHaveLength(1);

    const outbox = await store.getOutbox();
    expect(outbox.map((entry) => entry.type)).toEqual(['note.create']);
    expect(outbox[0]?.payload).toMatchObject({ clientId: note.id });
    store.close();
  });

  it('trims the title and caps the body on the way in', async () => {
    const store = await open();
    const note = await store.createNote({ title: '  عنوان  ', body: 'نصّ' });
    expect(note.title).toBe('عنوان');
    expect(note.body).toBe('نصّ');
    store.close();
  });

  it('edits in place, newest edit first, and queues an update', async () => {
    const store = await open(userIdentity('u-1'));
    const first = await store.createNote({ title: 'أولى' });
    const second = await store.createNote({ title: 'ثانية' });

    const updated = await store.updateNote(first.id, { body: 'جديد' });
    expect(updated?.id).toBe(first.id);
    expect((await store.getNotes()).map((note) => note.id)).toEqual([first.id, second.id]);

    const types = (await store.getOutbox()).map((entry) => entry.type);
    expect(types).toEqual(['note.create', 'note.create', 'note.update']);
    store.close();
  });

  it('tombstones a deleted note, hides it, and an undo restores it', async () => {
    const store = await open();
    const note = await store.createNote({ title: 'قابلة للحذف' });

    await store.deleteNote(note.id);
    expect(await store.getNotes()).toHaveLength(0);
    expect((await store.getOutbox()).at(-1)?.type).toBe('note.delete');

    const restored = await store.restoreNote(note.id);
    expect(restored?.deletedAt).toBeNull();
    expect(await store.getNotes()).toHaveLength(1);
    expect((await store.getOutbox()).at(-1)?.type).toBe('note.update');
    store.close();
  });

  it('applies a server page last-write-wins and advances the cursor', async () => {
    const store = await open(userIdentity('u-1'));
    const older = serverNote({
      id: '11111111-1111-7111-8111-111111111111',
      title: 'قديمة',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

    await store.applySyncSnapshot({ notes: [older], cursor: '2026-10-02T00:00:00.000Z' });
    expect((await store.getNotes())[0]?.title).toBe('قديمة');
    expect(await store.getSyncCursor()).toBe('2026-10-02T00:00:00.000Z');

    // An older server copy does not overwrite the newer local one.
    const newerLocal = await store.createNote({ title: 'محلّية' });
    await store.applySyncSnapshot({
      notes: [{ ...older, clientId: newerLocal.id, id: newerLocal.id, title: 'أقدم' }],
      cursor: '2026-10-03T00:00:00.000Z',
    });
    const kept = await store.getNote(newerLocal.id);
    expect(kept?.title).toBe('محلّية');
    store.close();
  });

  it('leaves a row with a queued intent alone and does not advance the cursor past it', async () => {
    const store = await open();
    const pending = await store.createNote({ title: 'بانتظار المزامنة' });

    await store.applySyncSnapshot({
      notes: [
        serverNote({
          id: pending.id,
          title: 'نسخة الخادم',
          updatedAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      cursor: '2026-10-02T00:00:00.000Z',
    });

    expect((await store.getNote(pending.id))?.title).toBe('بانتظار المزامنة');
    // The pending row is re-fetched by the next page, so the cursor stays put.
    expect(await store.getSyncCursor()).toBeNull();
    store.close();
  });

  it('claims a guest note and its intents into the account and empties the guest', async () => {
    const guest = await open();
    const guestNote = await guest.createNote({ title: 'من الزَّائر' });

    const account = await open(userIdentity('u-1'));
    await account.claimFrom(guest);

    expect((await account.getNotes()).map((note) => note.id)).toEqual([guestNote.id]);
    expect((await account.getOutbox()).map((entry) => entry.type)).toEqual(['note.create']);
    expect(await guest.getLocalData()).toEqual([]);
    account.close();
    guest.close();
  });
});
