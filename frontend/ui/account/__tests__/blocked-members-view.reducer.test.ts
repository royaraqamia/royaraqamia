import { describe, expect, it } from 'vitest';
import type { ChatPeer } from '@/shared/contracts/chat';
import {
  blockedMembersInitialState,
  blockedMembersReducer,
} from '@/frontend/ui/account/blocked-members-view.reducer';

const SARA: ChatPeer = {
  id: 'user-2',
  username: 'sara',
  name: 'سارة',
  avatarUrl: null,
  verified: true,
};

const OMAR: ChatPeer = {
  id: 'user-3',
  username: 'omar',
  name: null,
  avatarUrl: null,
  verified: false,
};

describe('blockedMembersReducer', () => {
  it('starts loading an empty list with no failure', () => {
    expect(blockedMembersInitialState()).toEqual({
      members: [],
      isLoading: true,
      loadError: null,
      actionError: null,
      lifting: null,
    });
  });

  it('settles the rows and the spinner together on success', () => {
    const state = blockedMembersReducer(blockedMembersInitialState(), {
      type: 'loadSucceeded',
      members: [SARA, OMAR],
    });

    expect(state).toEqual({
      members: [SARA, OMAR],
      isLoading: false,
      loadError: null,
      actionError: null,
      lifting: null,
    });
  });

  it('names the failure and stops loading', () => {
    const state = blockedMembersReducer(blockedMembersInitialState(), {
      type: 'loadFailed',
      error: 'تعذّر تحميل القائمة',
    });

    expect(state.isLoading).toBe(false);
    expect(state.loadError).toBe('تعذّر تحميل القائمة');
  });

  it('only settles the spinner for a guest', () => {
    const state = blockedMembersReducer(blockedMembersInitialState(), { type: 'loadSkipped' });

    expect(state.isLoading).toBe(false);
    expect(state.loadError).toBeNull();
  });

  it('waits on one row and clears a previous action failure when it succeeds', () => {
    const loaded = blockedMembersReducer(blockedMembersInitialState(), {
      type: 'loadSucceeded',
      members: [SARA, OMAR],
    });
    const failed = blockedMembersReducer(loaded, { type: 'unblockFailed', error: 'قديم' });
    const lifting = blockedMembersReducer(failed, { type: 'unblockStarted', id: OMAR.id });

    expect(lifting.lifting).toBe(OMAR.id);

    const state = blockedMembersReducer(lifting, {
      type: 'unblockSucceeded',
      id: OMAR.id,
    });

    expect(state.members).toEqual([SARA]);
    expect(state.actionError).toBeNull();
    expect(state.lifting).toBeNull();
  });

  it('keeps the row and names the reason when the server refuses', () => {
    const loaded = blockedMembersReducer(blockedMembersInitialState(), {
      type: 'loadSucceeded',
      members: [SARA],
    });
    const state = blockedMembersReducer(loaded, {
      type: 'unblockFailed',
      error: 'الخدمة غير متاحة',
    });

    expect(state.members).toEqual([SARA]);
    expect(state.actionError).toBe('الخدمة غير متاحة');
    expect(state.lifting).toBeNull();
  });
});
