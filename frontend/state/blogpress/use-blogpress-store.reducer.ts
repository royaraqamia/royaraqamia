import type { BlogpressDraft, BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import type { SyncStatus } from '@/frontend/api/blogpress/sync-engine';

const IDLE: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

/**
 * The editor's Local Store and what it has answered with: the store itself,
 * whether the read has landed, the draft beside it, the engine's status and the
 * connection.
 *
 * The open chain wrote the first three in one burst, and the engine's
 * subscription and the two window listeners wrote the last two — so the five are
 * one state here, with the connection passed in rather than read.
 */
export interface BlogpressEditorData {
  store: BlogpressLocalStore | null;
  ready: boolean;
  draft: BlogpressDraft | null;
  status: SyncStatus;
  online: boolean;
}

export type BlogpressEditorAction =
  | { type: 'opened'; store: BlogpressLocalStore }
  | { type: 'draftRead'; draft: BlogpressDraft | null }
  | { type: 'ready' }
  | { type: 'syncStatus'; status: SyncStatus }
  | { type: 'connectionChanged'; online: boolean };

export function blogpressEditorInitialState(online: boolean): BlogpressEditorData {
  return { store: null, ready: false, draft: null, status: IDLE, online };
}

export function blogpressEditorReducer(
  state: BlogpressEditorData,
  action: BlogpressEditorAction
): BlogpressEditorData {
  switch (action.type) {
    case 'opened':
      return { ...state, store: action.store };

    case 'draftRead':
      return { ...state, draft: action.draft };

    case 'ready':
      return { ...state, ready: true };

    case 'syncStatus':
      return { ...state, status: action.status };

    case 'connectionChanged':
      return { ...state, online: action.online };
  }
}
