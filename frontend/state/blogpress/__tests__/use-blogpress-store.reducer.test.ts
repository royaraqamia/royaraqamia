import { describe, expect, it } from 'vitest';

import type { BlogpressDraft, BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import type { SyncStatus } from '@/frontend/api/blogpress/sync-engine';
import {
  blogpressEditorInitialState,
  blogpressEditorReducer,
  type BlogpressEditorData,
} from '@/frontend/state/blogpress/use-blogpress-store.reducer';

const STORE = { name: 'store' } as unknown as BlogpressLocalStore;
const DRAFT = { id: 'p-1', title: 'مسودة' } as unknown as BlogpressDraft;
const SYNCING: SyncStatus = {
  syncing: true,
  pending: 2,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

function stateOf(patch: Partial<BlogpressEditorData> = {}): BlogpressEditorData {
  return { ...blogpressEditorInitialState(true), ...patch };
}

describe('blogpressEditorInitialState', () => {
  it('starts with no store, no draft and the connection it was given', () => {
    expect(blogpressEditorInitialState(false)).toEqual({
      store: null,
      ready: false,
      draft: null,
      status: {
        syncing: false,
        pending: 0,
        failed: 0,
        lastError: null,
        lastFailedType: null,
      },
      online: false,
    });
  });
});

describe('opening the store', () => {
  it('lands the store, its draft and readiness as three transitions of one state', () => {
    const opened = blogpressEditorReducer(stateOf(), { type: 'opened', store: STORE });
    const read = blogpressEditorReducer(opened, { type: 'draftRead', draft: DRAFT });
    const ready = blogpressEditorReducer(read, { type: 'ready' });

    expect(ready.store).toBe(STORE);
    expect(ready.draft).toBe(DRAFT);
    expect(ready.ready).toBe(true);
  });

  it('takes a draft the pull replaced without losing readiness', () => {
    const state = blogpressEditorReducer(stateOf({ ready: true, draft: DRAFT }), {
      type: 'draftRead',
      draft: null,
    });

    expect(state.draft).toBeNull();
    expect(state.ready).toBe(true);
  });
});

describe('the engine and the connection', () => {
  it('keeps the engine status the subscription reported', () => {
    const state = blogpressEditorReducer(stateOf(), { type: 'syncStatus', status: SYNCING });

    expect(state.status).toBe(SYNCING);
  });

  it('follows the window, not the clock', () => {
    const state = blogpressEditorReducer(stateOf({ online: true }), {
      type: 'connectionChanged',
      online: false,
    });

    expect(state.online).toBe(false);
  });
});
