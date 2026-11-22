import type { ShortenedLink } from '@/frontend/api/linksnap';
import type { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { SyncStatus } from '@/frontend/shared/local-store/sync-engine';

const EMPTY_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

/**
 * The LinkSnap Local Store and the rows it answered with: the identity the
 * store is open for, the store, the last painted list, the engine's status and
 * the connection.
 *
 * The open chain wrote the store and the identity together and the read wrote
 * the rows; the engine's subscription and the two window listeners wrote the
 * status and the connection — so the five are one state here.
 */
export interface LinksnapStoreData {
  readyFor: LocalIdentity | null;
  loading: boolean;
  store: LinksnapLocalStore | null;
  online: boolean;
  links: ShortenedLink[];
  status: SyncStatus;
}

export type LinksnapStoreAction =
  | { type: 'opened'; store: LinksnapLocalStore; identity: LocalIdentity }
  | { type: 'closed' }
  | { type: 'linksRead'; links: ShortenedLink[] }
  | { type: 'syncStatus'; status: SyncStatus }
  | { type: 'connectionChanged'; online: boolean }
  | { type: 'loadFinished' };

export function linksnapStoreInitialState(): LinksnapStoreData {
  return {
    readyFor: null,
    loading: true,
    store: null,
    online: true,
    links: [],
    status: EMPTY_STATUS,
  };
}

export function linksnapStoreReducer(
  state: LinksnapStoreData,
  action: LinksnapStoreAction
): LinksnapStoreData {
  switch (action.type) {
    case 'opened':
      return { ...state, store: action.store, readyFor: action.identity };

    case 'closed':
      return { ...state, store: null };

    case 'linksRead':
      return { ...state, links: action.links };

    case 'syncStatus':
      return { ...state, status: action.status };

    case 'connectionChanged':
      return { ...state, online: action.online };

    case 'loadFinished':
      return state.loading ? { ...state, loading: false } : state;
  }
}
