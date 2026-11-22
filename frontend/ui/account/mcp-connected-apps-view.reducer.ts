import type { McpConnectedApp } from '@/shared/contracts/mcp-connected-apps';

/** What a confirmed disconnect is aimed at: one client, or every client. */
export type DisconnectTarget = McpConnectedApp | 'all' | null;

/**
 * The connected-apps view reads one list and disconnects from it. The read wrote
 * the list, its two failure flags and (on failure) a cleared list together; the
 * confirm flow wrote the target, the busy flag and the action error. One state
 * here keeps those transitions in one place.
 */
export interface ConnectedAppsState {
  /** Null until the read answers; the cached list can seed it. */
  connectedApps: McpConnectedApp[] | null;
  loadFailed: boolean;
  /** True when the failure was a request that never reached the server. */
  loadOffline: boolean;
  actionError: string | null;
  target: DisconnectTarget;
  isDisconnecting: boolean;
}

export type ConnectedAppsAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; apps: McpConnectedApp[] }
  | { type: 'loadFailed'; offline: boolean }
  | { type: 'confirmOpened'; target: Exclude<DisconnectTarget, null> }
  | { type: 'confirmClosed' }
  | { type: 'disconnectStarted' }
  | { type: 'disconnectSettled' }
  | { type: 'disconnectFailed'; error: string };

export function connectedAppsInitialState(cached: McpConnectedApp[] | null): ConnectedAppsState {
  return {
    connectedApps: cached,
    loadFailed: false,
    loadOffline: false,
    actionError: null,
    target: null,
    isDisconnecting: false,
  };
}

export function connectedAppsReducer(
  state: ConnectedAppsState,
  action: ConnectedAppsAction
): ConnectedAppsState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loadFailed: false, loadOffline: false };

    case 'loadSucceeded':
      return {
        ...state,
        connectedApps: action.apps,
        loadFailed: false,
        loadOffline: false,
      };

    case 'loadFailed':
      return {
        ...state,
        connectedApps: null,
        loadFailed: true,
        loadOffline: action.offline,
      };

    case 'confirmOpened':
      return { ...state, target: action.target };

    case 'confirmClosed':
      return state.target === null ? state : { ...state, target: null };

    case 'disconnectStarted':
      return { ...state, isDisconnecting: true, actionError: null };

    // The sheet closes however the request answered; a refusal is named after.
    case 'disconnectSettled':
      return { ...state, isDisconnecting: false, target: null };

    case 'disconnectFailed':
      return { ...state, actionError: action.error };
  }
}
