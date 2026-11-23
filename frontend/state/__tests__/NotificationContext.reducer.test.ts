import { describe, expect, it } from 'vitest';
import type { NotificationWithMeta } from '@/shared/contracts/notifications';
import {
  notificationInitialState,
  notificationReducer,
  type NotificationState,
} from '@/frontend/state/NotificationContext.reducer';

function notif(id: string, isRead = false): NotificationWithMeta {
  return {
    id,
    user_id: 'u-1',
    type: 'system_announcement',
    title: `title-${id}`,
    body: null,
    metadata: {},
    is_read: isRead,
    created_at: '2026-08-02T08:00:00.000Z',
    read_at: null,
    timeAgo: 'قبل قليل',
  };
}

function stateOf(patch: Partial<NotificationState> = {}): NotificationState {
  return { ...notificationInitialState(), ...patch };
}

describe('notificationInitialState', () => {
  it('waits on the first read with an empty feed and badge', () => {
    expect(notificationInitialState()).toEqual({
      notifications: [],
      unreadCount: 0,
      isLoading: true,
      failed: false,
    });
  });
});

describe('the read', () => {
  it('lands the feed and the badge together', () => {
    const rows = [notif('n-1'), notif('n-2', true)];

    expect(
      notificationReducer(stateOf(), { type: 'loaded', notifications: rows, unreadCount: 1 })
    ).toEqual({
      notifications: rows,
      unreadCount: 1,
      isLoading: false,
      failed: false,
    });
  });

  it('clears the feed for a signed-out visitor', () => {
    const state = stateOf({ notifications: [notif('n-1')], unreadCount: 1, isLoading: true });

    expect(notificationReducer(state, { type: 'cleared' })).toEqual({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      failed: false,
    });
  });

  it('names an unreachable server instead of an empty account', () => {
    const state = stateOf({ notifications: [notif('n-1')], unreadCount: 1, isLoading: true });

    expect(notificationReducer(state, { type: 'failed' })).toEqual({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      failed: true,
    });
  });
});

describe('a Realtime change', () => {
  it('prepends an insert and counts it, keeping the list when the echo repeats', () => {
    const inserted = notificationReducer(stateOf(), {
      type: 'inserted',
      notification: notif('n-1'),
    });
    expect(inserted.notifications.map((n) => n.id)).toEqual(['n-1']);
    expect(inserted.unreadCount).toBe(1);

    const repeated = notificationReducer(inserted, {
      type: 'inserted',
      notification: notif('n-1'),
    });
    expect(repeated.notifications).toBe(inserted.notifications);
    expect(repeated.unreadCount).toBe(2);
  });

  it('decrements once when the row that was unread is marked read', () => {
    const state = stateOf({ notifications: [notif('n-1')], unreadCount: 1 });

    expect(
      notificationReducer(state, { type: 'updated', notification: notif('n-1', true) })
    ).toMatchObject({ unreadCount: 0 });
  });

  it('leaves the badge alone when an already-read row is updated again', () => {
    const state = stateOf({ notifications: [notif('n-1', true)], unreadCount: 0 });
    const updated = notificationReducer(state, {
      type: 'updated',
      notification: notif('n-1', true),
    });

    expect(updated.unreadCount).toBe(0);
  });

  it('drops a deleted unread row from the badge', () => {
    const state = stateOf({ notifications: [notif('n-1'), notif('n-2')], unreadCount: 2 });

    expect(notificationReducer(state, { type: 'deleted', id: 'n-1' })).toMatchObject({
      unreadCount: 1,
    });
  });

  it('keeps the badge when the deleted row was already read', () => {
    const state = stateOf({ notifications: [notif('n-1', true)], unreadCount: 1 });

    expect(notificationReducer(state, { type: 'deleted', id: 'n-1' })).toMatchObject({
      unreadCount: 1,
    });
  });
});

describe('the member acting on the feed', () => {
  it('marks one row read and drops the badge', () => {
    const state = stateOf({ notifications: [notif('n-1')], unreadCount: 1 });

    expect(
      notificationReducer(state, {
        type: 'markedRead',
        id: 'n-1',
        readAt: '2026-08-03T09:00:00.000Z',
      })
    ).toMatchObject({
      notifications: [
        expect.objectContaining({ is_read: true, read_at: '2026-08-03T09:00:00.000Z' }),
      ],
      unreadCount: 0,
    });
  });

  it('marks the whole feed read and keeps an existing read timestamp', () => {
    const read = notif('n-2', true);
    read.read_at = '2026-08-01T00:00:00.000Z';
    const state = stateOf({ notifications: [notif('n-1'), read], unreadCount: 1 });

    const next = notificationReducer(state, {
      type: 'allMarkedRead',
      readAt: '2026-08-03T09:00:00.000Z',
    });

    expect(next.unreadCount).toBe(0);
    expect(next.notifications.map((n) => n.read_at)).toEqual([
      '2026-08-03T09:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    ]);
  });

  it('restores the feed it optimistically replaced when the call fails', () => {
    const snapshot = [notif('n-1'), notif('n-2', true)];
    const optimistic = stateOf({
      notifications: snapshot.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    });

    expect(
      notificationReducer(optimistic, { type: 'restored', notifications: snapshot })
    ).toMatchObject({ notifications: snapshot, unreadCount: 1 });
  });
});
