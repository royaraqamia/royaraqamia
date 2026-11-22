import { describe, expect, it } from 'vitest';
import type { McpConnectedApp } from '@/shared/contracts/mcp-connected-apps';
import {
  connectedAppsInitialState,
  connectedAppsReducer,
} from '@/frontend/ui/account/mcp-connected-apps-view.reducer';

const CLAUDE: McpConnectedApp = {
  clientId: 'client-1',
  clientName: 'Claude Code',
  connectedAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: '2026-10-13T10:00:00.000Z',
};

describe('connectedAppsReducer', () => {
  it('seeds the list from the cache and stays idle', () => {
    expect(connectedAppsInitialState([CLAUDE])).toEqual({
      connectedApps: [CLAUDE],
      loadFailed: false,
      loadOffline: false,
      actionError: null,
      target: null,
      isDisconnecting: false,
    });
  });

  it('clears the failure flags when a read starts', () => {
    const failed = connectedAppsReducer(connectedAppsInitialState(null), {
      type: 'loadFailed',
      offline: true,
    });

    expect(connectedAppsReducer(failed, { type: 'loadStarted' })).toMatchObject({
      loadFailed: false,
      loadOffline: false,
    });
  });

  it('settles the list on success', () => {
    const state = connectedAppsReducer(connectedAppsInitialState(null), {
      type: 'loadSucceeded',
      apps: [CLAUDE],
    });

    expect(state.connectedApps).toEqual([CLAUDE]);
    expect(state.loadFailed).toBe(false);
  });

  it('drops a stale list and names an unreachable read', () => {
    const state = connectedAppsReducer(connectedAppsInitialState([CLAUDE]), {
      type: 'loadFailed',
      offline: true,
    });

    expect(state.connectedApps).toBeNull();
    expect(state.loadFailed).toBe(true);
    expect(state.loadOffline).toBe(true);
  });

  it('opens a confirmation, then closes it on cancel', () => {
    const opened = connectedAppsReducer(connectedAppsInitialState(null), {
      type: 'confirmOpened',
      target: CLAUDE,
    });

    expect(opened.target).toBe(CLAUDE);
    expect(connectedAppsReducer(opened, { type: 'confirmClosed' }).target).toBeNull();
  });

  it('holds the sheet open while disconnecting and names a refusal after it settles', () => {
    const opened = connectedAppsReducer(connectedAppsInitialState(null), {
      type: 'confirmOpened',
      target: 'all',
    });
    const busy = connectedAppsReducer(opened, { type: 'disconnectStarted' });

    expect(busy.isDisconnecting).toBe(true);
    expect(busy.actionError).toBeNull();

    const settled = connectedAppsReducer(busy, { type: 'disconnectSettled' });
    expect(settled.isDisconnecting).toBe(false);
    expect(settled.target).toBeNull();

    const failed = connectedAppsReducer(settled, {
      type: 'disconnectFailed',
      error: 'الخدمة غير متاحة',
    });
    expect(failed.actionError).toBe('الخدمة غير متاحة');
  });
});
