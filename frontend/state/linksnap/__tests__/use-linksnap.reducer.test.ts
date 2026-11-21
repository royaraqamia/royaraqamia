import { describe, expect, it } from 'vitest';

import type { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import {
  linksnapStoreInitialState,
  linksnapStoreReducer,
  type LinksnapStoreData,
} from '@/frontend/state/linksnap/use-linksnap.reducer';

const STORE = {} as LinksnapLocalStore;

function stateOf(patch: Partial<LinksnapStoreData> = {}): LinksnapStoreData {
  return { ...linksnapStoreInitialState(), ...patch };
}

describe('linksnapStoreInitialState', () => {
  it('waits for the first read and assumes the connection is up', () => {
    expect(linksnapStoreInitialState()).toEqual({
      readyFor: null,
      loading: true,
      store: null,
      online: true,
      links: [],
      status: { syncing: false, pending: 0, failed: 0, lastError: null, lastFailedType: null },
    });
  });
});

describe('opening the store', () => {
  it('records the store and the identity it answered for in one transition', () => {
    const identity = userIdentity('u-1');
    const state = linksnapStoreReducer(stateOf({ links: [{ code: 'abc' } as never] }), {
      type: 'opened',
      store: STORE,
      identity,
    });

    expect(state.store).toBe(STORE);
    expect(state.readyFor).toBe(identity);
  });

  it('drops the store on close but keeps the identity that answered', () => {
    const identity = userIdentity('u-1');
    const state = linksnapStoreReducer(stateOf({ store: STORE, readyFor: identity }), {
      type: 'closed',
    });

    expect(state.store).toBeNull();
    expect(state.readyFor).toBe(identity);
  });
});

describe('the pixels the surface paints', () => {
  it('replaces the list with the store rows', () => {
    const rows = [{ code: 'one' } as never];

    expect(linksnapStoreReducer(stateOf(), { type: 'linksRead', links: rows }).links).toBe(rows);
  });

  it('follows the engine status and the connection', () => {
    const status = { syncing: true, pending: 2, failed: 0, lastError: null, lastFailedType: null };
    const synced = linksnapStoreReducer(stateOf(), { type: 'syncStatus', status });
    const offline = linksnapStoreReducer(synced, { type: 'connectionChanged', online: false });

    expect(synced.status).toBe(status);
    expect(offline.online).toBe(false);
  });

  it('finishes the load once and does not churn after that', () => {
    const done = linksnapStoreReducer(stateOf(), { type: 'loadFinished' });

    expect(done.loading).toBe(false);
    expect(linksnapStoreReducer(done, { type: 'loadFinished' })).toBe(done);
  });
});
