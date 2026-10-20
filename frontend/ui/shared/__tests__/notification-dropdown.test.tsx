import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import type { NotificationWithMeta } from '@/shared/contracts/notifications';
import { NotificationDropdown } from '../notification-dropdown';

const { mocks } = vi.hoisted(() => {
  function buildNotification(id: string, title: string, isRead = false): NotificationWithMeta {
    return {
      id,
      user_id: 'user-1',
      type: 'post_published',
      title,
      body: null,
      metadata: {},
      is_read: isRead,
      created_at: '2026-10-01T00:00:00.000Z',
      read_at: null,
      timeAgo: 'قبل دقيقة',
    };
  }

  return {
    mocks: {
      notifications: [
        buildNotification('n1', 'الأول'),
        buildNotification('n2', 'الثاني'),
        buildNotification('n3', 'الثالث', true),
      ] as NotificationWithMeta[],
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotification: vi.fn(),
    },
  };
});

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/frontend/state/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: mocks.notifications,
    unreadCount: mocks.notifications.filter((n) => !n.is_read).length,
    isLoading: false,
    markAsRead: mocks.markAsRead,
    markAllAsRead: mocks.markAllAsRead,
    deleteNotification: mocks.deleteNotification,
  }),
}));

// Radix's ScrollArea needs layout observers jsdom does not provide; the menu's
// keyboard contract does not depend on the scrolling mechanics.
vi.mock('@/frontend/ui/primitives/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/frontend/ui/shared/push-notification-toggle', () => ({
  PushNotificationToggle: () => <button type="button">push-toggle</button>,
}));

function renderDropdown() {
  return render(
    <>
      <NotificationDropdown />
      <button type="button">outside</button>
    </>
  );
}

function getTrigger() {
  return screen.getByRole('button', { name: /الإشعارات/ });
}

function openWithPointer() {
  fireEvent.click(getTrigger());
  return screen.getByRole('menu');
}

function menuItem(name: string | RegExp) {
  return screen.getByRole('menuitem', { name });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationDropdown keyboard behaviour', () => {
  it('moves focus to the first notification when opened, and links the trigger to the panel', () => {
    renderDropdown();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    const menu = openWithPointer();

    expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');
    expect(getTrigger()).toHaveAttribute('aria-controls', menu.id);
    expect(menuItem(/الأول/)).toHaveFocus();
  });

  it('closes again when the trigger is activated while open', () => {
    renderDropdown();
    openWithPointer();

    fireEvent.click(getTrigger());

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves between items with ArrowDown and ArrowUp, wrapping at the ends', () => {
    renderDropdown();
    openWithPointer();

    fireEvent.keyDown(menuItem(/الأول/), { key: 'ArrowDown' });
    expect(menuItem(/الثاني/)).toHaveFocus();

    fireEvent.keyDown(menuItem(/الثاني/), { key: 'ArrowDown' });
    expect(menuItem(/الثالث/)).toHaveFocus();

    fireEvent.keyDown(menuItem(/الثالث/), { key: 'ArrowDown' });
    expect(menuItem(/الأول/)).toHaveFocus();

    fireEvent.keyDown(menuItem(/الأول/), { key: 'ArrowUp' });
    expect(menuItem(/الثالث/)).toHaveFocus();
  });

  it('jumps to the first and last item with Home and End', () => {
    renderDropdown();
    openWithPointer();

    fireEvent.keyDown(menuItem(/الأول/), { key: 'End' });
    expect(menuItem(/الثالث/)).toHaveFocus();

    fireEvent.keyDown(menuItem(/الثالث/), { key: 'Home' });
    expect(menuItem(/الأول/)).toHaveFocus();
  });

  it('keeps a single roving tab stop on the focused item', () => {
    renderDropdown();
    openWithPointer();

    fireEvent.keyDown(menuItem(/الأول/), { key: 'ArrowDown' });

    expect(menuItem(/الثاني/)).toHaveAttribute('tabindex', '0');
    expect(menuItem(/الأول/)).toHaveAttribute('tabindex', '-1');
    expect(menuItem(/الثالث/)).toHaveAttribute('tabindex', '-1');
  });

  it('closes on Escape from inside the menu and returns focus to the trigger', () => {
    renderDropdown();
    openWithPointer();

    fireEvent.keyDown(menuItem(/الأول/), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(getTrigger()).toHaveFocus();
  });

  it('closes on Escape while focus is still on the trigger', () => {
    renderDropdown();
    openWithPointer();

    getTrigger().focus();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(getTrigger(), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(getTrigger()).toHaveFocus();
  });

  it('closes when focus leaves the menu, so Tab cannot leave it dangling', () => {
    renderDropdown();
    openWithPointer();

    act(() => {
      screen.getByRole('button', { name: 'outside' }).focus();
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when focus moves back to the trigger without stealing it away', () => {
    renderDropdown();
    openWithPointer();

    getTrigger().focus();

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(getTrigger()).toHaveFocus();
  });
});

describe('NotificationDropdown pointer behaviour', () => {
  it('closes on an outside pointer press', () => {
    renderDropdown();
    openWithPointer();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not move focus into the menu when it is dismissed by a pointer press', () => {
    renderDropdown();
    openWithPointer();

    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();
    fireEvent.mouseDown(outside);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });
});
