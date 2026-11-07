import { describe, expect, it } from 'vitest';

import type { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import type { SyncStatus } from '@/frontend/api/blogpress/sync-engine';
import {
  blogpressDashboardInitialState,
  blogpressDashboardReducer,
  type BlogpressDashboardData,
} from '@/frontend/state/blogpress/use-blogpress-dashboard.reducer';
import type { Post } from '@/shared/contracts/blogpress';

const STORE = { name: 'store' } as unknown as BlogpressLocalStore;
const POST = { id: 'p-1', title: 'منشور' } as unknown as Post;
const IDENTITY = 'user:u-1';
const FAILED: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 1,
  lastError: 'تعذّر',
  lastFailedType: 'post',
};

function stateOf(patch: Partial<BlogpressDashboardData> = {}): BlogpressDashboardData {
  return { ...blogpressDashboardInitialState(true), ...patch };
}

describe('blogpressDashboardInitialState', () => {
  it('starts with no store, no rows and the connection it was given', () => {
    expect(blogpressDashboardInitialState(true)).toEqual({
      store: null,
      readyFor: null,
      posts: [],
      status: {
        syncing: false,
        pending: 0,
        failed: 0,
        lastError: null,
        lastFailedType: null,
      },
      online: true,
    });
  });
});

describe('reading the rows', () => {
  it('lands the store, the rows and the identity the read answered for', () => {
    const opened = blogpressDashboardReducer(stateOf(), { type: 'opened', store: STORE });
    const read = blogpressDashboardReducer(opened, { type: 'postsRead', posts: [POST] });
    const ready = blogpressDashboardReducer(read, { type: 'ready', identity: IDENTITY });

    expect(ready.store).toBe(STORE);
    expect(ready.posts).toEqual([POST]);
    expect(ready.readyFor).toBe(IDENTITY);
  });
});

describe('the engine and the connection', () => {
  it('keeps a failed sync on the status', () => {
    const state = blogpressDashboardReducer(stateOf(), { type: 'syncStatus', status: FAILED });

    expect(state.status).toBe(FAILED);
    expect(state.posts).toEqual([]);
  });

  it('follows the window', () => {
    const state = blogpressDashboardReducer(stateOf({ online: true }), {
      type: 'connectionChanged',
      online: false,
    });

    expect(state.online).toBe(false);
  });
});
