import { describe, expect, it, vi } from 'vitest';

import {
  listExistingDatabases,
  readDrainSession,
  SESSION_PATH,
} from '@/frontend/shared/local-store/drain-entry';

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('readDrainSession', () => {
  it('asks the session route and never lets an answer be cached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ userId: 'u-1' }));

    await expect(readDrainSession(fetchMock as unknown as typeof fetch)).resolves.toEqual({
      userId: 'u-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(SESSION_PATH, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  });

  it('answers null for a visitor with no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));

    await expect(readDrainSession(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('ignores a userId that is not a string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ userId: 7 }));

    await expect(readDrainSession(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('throws when the lookup fails, rather than claiming nobody is signed in', async () => {
    // Answering null here would replay the guest namespace with no credential
    // and look like a successful drain.
    const fetchMock = vi.fn().mockResolvedValue(response({}, false));

    await expect(readDrainSession(fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /session lookup failed/
    );
  });
});

describe('listExistingDatabases', () => {
  it('lists the names and drops everything that is not one', async () => {
    const factory = {
      databases: vi
        .fn()
        .mockResolvedValue([{ name: 'habitflow:user:u-1' }, { name: undefined }, { name: 4 }, {}]),
    } as unknown as IDBFactory;

    await expect(listExistingDatabases(factory)).resolves.toEqual(['habitflow:user:u-1']);
  });

  it('answers null where the realm cannot list databases', async () => {
    // A drain then skips every product instead of letting `open` create a store
    // no migration chain can repair.
    await expect(listExistingDatabases({} as IDBFactory)).resolves.toBeNull();
  });
});
