import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '@/frontend/state/NotificationContext';
import type { PostgresChangeHandlers } from '@/frontend/transport/supabase/realtime';

const mocks = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  subscribeToNotificationChanges: vi.fn(),
  toast: vi.fn(),
  handlers: null as PostgresChangeHandlers | null,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: { id: 'u-1' }, isLoading: false, signOut: vi.fn() }),
}));

vi.mock('@/frontend/api/notifications', () => ({
  getNotifications: mocks.getNotifications,
  getUnreadCount: mocks.getUnreadCount,
  markAsRead: mocks.markAsRead,
  markAllAsRead: mocks.markAllAsRead,
  deleteNotification: mocks.deleteNotification,
  subscribeToNotificationChanges: mocks.subscribeToNotificationChanges,
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

function Harness() {
  const { unreadCount, markAsRead } = useNotifications();
  return (
    <div>
      <span data-testid="unread">{unreadCount}</span>
      <button onClick={() => markAsRead('n-1')}>read</button>
    </div>
  );
}

const makeNotif = (id: string, isRead = false) => ({
  id,
  user_id: 'u-1',
  type: 'system_announcement' as const,
  title: `title-${id}`,
  body: null,
  metadata: {},
  is_read: isRead,
  created_at: '2026-08-02T08:00:00.000Z',
  read_at: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers = null;
  mocks.subscribeToNotificationChanges.mockImplementation(
    (_userId: string, handlers: PostgresChangeHandlers) => {
      mocks.handlers = handlers;
      return () => {};
    }
  );
  mocks.getNotifications.mockResolvedValue([makeNotif('n-1'), makeNotif('n-2')]);
  mocks.getUnreadCount.mockResolvedValue(2);
  mocks.markAsRead.mockResolvedValue(undefined);
});

describe('NotificationProvider unread count', () => {
  it('decrements the unread count exactly once when a single notification is marked read', async () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    );

    expect(await screen.findByTestId('unread')).toHaveTextContent('2');
    expect(mocks.handlers).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'read' }));

    // Optimistic update applied locally.
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('1'));

    // Emit the realtime UPDATE echo of the same mark-as-read (the browser's own
    // change is broadcast back to it). This must NOT decrement a second time.
    act(() =>
      mocks.handlers?.onUpdate({
        new: makeNotif('n-1', true),
        old: makeNotif('n-1'),
        eventType: 'UPDATE',
        schema: 'public',
        table: 'notifications',
      } as never)
    );

    expect(screen.getByTestId('unread')).toHaveTextContent('1');
  });

  it('decrements when another device marks an unread notification as read', async () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    );

    expect(await screen.findByTestId('unread')).toHaveTextContent('2');
    expect(mocks.handlers).not.toBeNull();

    // External change while the local list still shows the item as unread.
    act(() =>
      mocks.handlers?.onUpdate({
        new: makeNotif('n-2', true),
        old: makeNotif('n-2'),
        eventType: 'UPDATE',
        schema: 'public',
        table: 'notifications',
      } as never)
    );

    expect(screen.getByTestId('unread')).toHaveTextContent('1');
  });
});