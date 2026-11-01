import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NotificationType, NotificationWithMeta } from '@/shared/contracts/notifications';
import { NotificationsView } from '../notifications-view';

const { state, mocks } = vi.hoisted(() => {
  return {
    state: {
      search: '',
      user: { id: 'user-1' } as { id: string } | null,
      notifications: [] as NotificationWithMeta[],
      unreadCount: 0,
      isLoading: false,
    },
    mocks: {
      replace: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotification: vi.fn(),
    },
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: state.user }),
}));

vi.mock('@/frontend/state/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    isLoading: state.isLoading,
    markAsRead: mocks.markAsRead,
    markAllAsRead: mocks.markAllAsRead,
    deleteNotification: mocks.deleteNotification,
  }),
}));

vi.mock('@/frontend/ui/shared/push-notification-toggle', () => ({
  PushNotificationToggle: () => <button type="button">push-toggle</button>,
}));

/**
 * The Chats tab's list is its own read (ADR-0113); this file is about the tab
 * frame, so the panel is stubbed as a settled, empty list.
 */
vi.mock('@/frontend/state/chats/use-chat-threads', () => ({
  useChatThreads: () => ({
    threads: [],
    unreadCount: 0,
    isLoading: false,
    refresh: vi.fn(),
    respond: vi.fn(),
    start: vi.fn(),
  }),
}));

function notification(
  id: string,
  type: NotificationType,
  overrides: Partial<NotificationWithMeta> = {}
): NotificationWithMeta {
  return {
    id,
    user_id: 'user-1',
    type,
    title: id,
    body: null,
    metadata: {},
    is_read: false,
    created_at: '2026-10-01T00:00:00.000Z',
    read_at: null,
    timeAgo: 'قبل دقيقة',
    ...overrides,
  };
}

function tab(name: RegExp) {
  return screen.getByRole('tab', { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.search = '';
  state.user = { id: 'user-1' };
  state.notifications = [];
  state.unreadCount = 0;
  state.isLoading = false;
});

describe('NotificationsView tabs', () => {
  it('opens on Alerts when the feed has an unread row', () => {
    state.notifications = [notification('n1', 'post_published')];
    state.unreadCount = 1;

    render(<NotificationsView />);

    expect(tab(/التنبيهات/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/المحادثات/)).toHaveAttribute('aria-selected', 'false');
  });

  it('opens on Chats when nothing is unread', () => {
    state.notifications = [
      notification('n1', 'post_published', { is_read: true, read_at: '2026-10-01T00:00:00.000Z' }),
    ];

    render(<NotificationsView />);

    expect(tab(/المحادثات/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('لا توجد محادثات بعد')).toBeInTheDocument();
  });

  it('lets an explicit ?tab= win over the unread default', () => {
    state.search = 'tab=chats';
    state.notifications = [notification('n1', 'post_published')];
    state.unreadCount = 1;

    render(<NotificationsView />);

    expect(tab(/المحادثات/)).toHaveAttribute('aria-selected', 'true');
  });

  it('replaces the URL rather than adding a history entry when a tab is picked', () => {
    state.notifications = [notification('n1', 'post_published')];

    render(<NotificationsView />);
    fireEvent.click(tab(/المحادثات/));

    expect(tab(/المحادثات/)).toHaveAttribute('aria-selected', 'true');
    expect(mocks.replace).toHaveBeenCalledWith('/notifications?tab=chats', { scroll: false });
  });

  it('shows an unread count on the tab that owns it, and none on an empty one', () => {
    state.notifications = [notification('n1', 'post_published')];
    state.unreadCount = 3;

    render(<NotificationsView />);

    expect(tab(/التنبيهات/)).toHaveTextContent('3');
    expect(tab(/المحادثات/)).not.toHaveTextContent('0');
  });

  it('paints no tab selection until the feed has answered', () => {
    state.isLoading = true;

    render(<NotificationsView />);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText('جاري التَّحميل...')).toBeInTheDocument();
  });
});

describe('NotificationsView rows', () => {
  it('links a row to the destination derived from its type and metadata', () => {
    state.notifications = [
      notification('n1', 'post_published', { title: 'منشور', metadata: { slug: 'hello' } }),
    ];
    state.unreadCount = 1;

    render(<NotificationsView />);

    expect(screen.getByRole('link', { name: /منشور/ })).toHaveAttribute('href', '/community/hello');
  });

  it('marks an unread row read when it is opened', () => {
    state.notifications = [
      notification('n1', 'certificate_issued', { metadata: { certificateCode: 'C-1' } }),
    ];
    state.unreadCount = 1;

    render(<NotificationsView />);
    fireEvent.click(screen.getByRole('link', { name: /n1/ }));

    expect(mocks.markAsRead).toHaveBeenCalledWith('n1');
  });

  it('leaves an already-read row alone when it is opened', () => {
    state.search = 'tab=alerts';
    state.notifications = [
      notification('n1', 'certificate_issued', {
        is_read: true,
        read_at: '2026-10-01T00:00:00.000Z',
        metadata: { certificateCode: 'C-1' },
      }),
    ];

    render(<NotificationsView />);
    fireEvent.click(screen.getByRole('link', { name: /n1/ }));

    expect(mocks.markAsRead).not.toHaveBeenCalled();
  });

  it('renders a row with nowhere to go as a button that only marks it read', () => {
    state.notifications = [notification('n1', 'system_announcement', { title: 'إعلان' })];
    state.unreadCount = 1;

    render(<NotificationsView />);

    expect(screen.queryByRole('link', { name: /إعلان/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /إعلان/ }));
    expect(mocks.markAsRead).toHaveBeenCalledWith('n1');
  });

  it('deletes from the row without opening it', () => {
    state.notifications = [notification('n1', 'post_published', { metadata: { slug: 'hello' } })];
    state.unreadCount = 1;

    render(<NotificationsView />);
    fireEvent.click(screen.getByRole('button', { name: 'حذف الإشعار' }));

    expect(mocks.deleteNotification).toHaveBeenCalledWith('n1');
    expect(mocks.markAsRead).not.toHaveBeenCalled();
  });

  it('anchors the delete control at the row inline end, inside the pe-8 gutter', () => {
    state.notifications = [notification('n1', 'post_published', { metadata: { slug: 'hello' } })];
    state.unreadCount = 1;

    render(<NotificationsView />);

    // `end-3` is the logical-inset utility Tailwind generates. The physical spelling
    // `inset-inline-end-3` emits no CSS at all, leaving `top-3` as the only anchor, so the
    // control fell back to the row's inline start and sat on the notification text.
    const del = screen.getByRole('button', { name: 'حذف الإشعار' });
    expect(del).toHaveClass('absolute', 'top-3', 'end-3');
    expect(del.className).not.toContain('inset-inline-');
  });

  it('marks every row read from the header', () => {
    state.notifications = [notification('n1', 'post_published')];
    state.unreadCount = 1;

    render(<NotificationsView />);
    fireEvent.click(screen.getByRole('button', { name: /تحديد الكل كمقروء/ }));

    expect(mocks.markAllAsRead).toHaveBeenCalled();
  });
});

describe('NotificationsView guests', () => {
  it('prompts a signed-out visitor to sign in, and returns them to the page', () => {
    state.user = null;

    render(<NotificationsView />);

    expect(screen.getByText('سجِّل الدُّخول لمتابعة إشعاراتك')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent('/notifications')}`
    );
  });

  it('keeps the push toggle out of a guest session', () => {
    state.user = null;

    render(<NotificationsView />);

    expect(screen.queryByRole('button', { name: 'push-toggle' })).not.toBeInTheDocument();
  });
});
