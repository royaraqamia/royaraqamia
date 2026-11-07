import type { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import type { SyncStatus } from '@/frontend/api/blogpress/sync-engine';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { Post } from '@/shared/contracts/blogpress';

const IDLE: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

/**
 * The dashboard's Local Store and the rows it answered with: the store, the
 * identity the read is tagged for, the posts, the engine's status and the
 * connection.
 *
 * The open chain wrote the store and the rows together and stamped the identity
 * last; the engine's subscription and the two window listeners wrote the other
 * two — so the five are one state here, with the connection passed in.
 */
export interface BlogpressDashboardData {
  store: BlogpressLocalStore | null;
  /** The identity the store read answered, or null before the first read. */
  readyFor: LocalIdentity | null;
  posts: Post[];
  status: SyncStatus;
  online: boolean;
}

export type BlogpressDashboardAction =
  | { type: 'opened'; store: BlogpressLocalStore }
  | { type: 'postsRead'; posts: Post[] }
  | { type: 'ready'; identity: LocalIdentity }
  | { type: 'syncStatus'; status: SyncStatus }
  | { type: 'connectionChanged'; online: boolean };

export function blogpressDashboardInitialState(online: boolean): BlogpressDashboardData {
  return { store: null, readyFor: null, posts: [], status: IDLE, online };
}

export function blogpressDashboardReducer(
  state: BlogpressDashboardData,
  action: BlogpressDashboardAction
): BlogpressDashboardData {
  switch (action.type) {
    case 'opened':
      return { ...state, store: action.store };

    case 'postsRead':
      return { ...state, posts: action.posts };

    case 'ready':
      return { ...state, readyFor: action.identity };

    case 'syncStatus':
      return { ...state, status: action.status };

    case 'connectionChanged':
      return { ...state, online: action.online };
  }
}
