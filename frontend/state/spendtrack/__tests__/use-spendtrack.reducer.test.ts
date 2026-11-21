import { describe, expect, it } from 'vitest';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';
import type { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import {
  EMPTY_SPENDTRACK_ROWS,
  EMPTY_SPENDTRACK_STATUS,
  spendtrackStoreInitialState,
  spendtrackStoreReducer,
  type SpendtrackRows,
} from '@/frontend/state/spendtrack/use-spendtrack.reducer';

const STORE = {} as SpendtrackLocalStore;
const ROWS: SpendtrackRows = {
  ...EMPTY_SPENDTRACK_ROWS,
  expenses: [{ id: 'e-1' } as SpendtrackRows['expenses'][number]],
};

describe('spendtrackStoreInitialState', () => {
  it('starts closed, online, empty and idle', () => {
    expect(spendtrackStoreInitialState()).toEqual({
      readyFor: null,
      store: null,
      online: true,
      rows: EMPTY_SPENDTRACK_ROWS,
      status: EMPTY_SPENDTRACK_STATUS,
    });
  });
});

describe('hydrated', () => {
  it('adopts the identity, the store and its first rows in one transition', () => {
    const state = spendtrackStoreReducer(spendtrackStoreInitialState(), {
      type: 'hydrated',
      identity: userIdentity('u-1'),
      store: STORE,
      rows: ROWS,
    });

    expect(state.readyFor).toEqual(userIdentity('u-1'));
    expect(state.store).toBe(STORE);
    expect(state.rows).toBe(ROWS);
  });
});

describe('rowsRead', () => {
  it('replaces the four collections without touching the bootstrap', () => {
    const opened = spendtrackStoreReducer(spendtrackStoreInitialState(), {
      type: 'hydrated',
      identity: GUEST_IDENTITY,
      store: STORE,
      rows: EMPTY_SPENDTRACK_ROWS,
    });

    const state = spendtrackStoreReducer(opened, { type: 'rowsRead', rows: ROWS });

    expect(state.rows).toBe(ROWS);
    expect(state.store).toBe(STORE);
    expect(state.readyFor).toEqual(GUEST_IDENTITY);
  });
});

describe('storeReleased', () => {
  it('drops the store but keeps the rows for the last painted screen', () => {
    const opened = spendtrackStoreReducer(spendtrackStoreInitialState(), {
      type: 'hydrated',
      identity: userIdentity('u-1'),
      store: STORE,
      rows: ROWS,
    });

    const state = spendtrackStoreReducer(opened, { type: 'storeReleased' });

    expect(state.store).toBeNull();
    expect(state.rows).toBe(ROWS);
  });
});

describe('the network and the engine', () => {
  it('records the online flag', () => {
    expect(
      spendtrackStoreReducer(spendtrackStoreInitialState(), {
        type: 'onlineChanged',
        online: false,
      }).online
    ).toBe(false);
  });

  it('records the engine status', () => {
    const status = { ...EMPTY_SPENDTRACK_STATUS, syncing: true, pending: 2 };
    expect(
      spendtrackStoreReducer(spendtrackStoreInitialState(), { type: 'statusChanged', status })
        .status
    ).toBe(status);
  });
});
