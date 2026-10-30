import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationBell } from '../notification-bell';

const { state } = vi.hoisted(() => ({ state: { unreadCount: 0, pathname: '/' } }));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));

vi.mock('@/frontend/state/NotificationContext', () => ({
  useNotifications: () => ({ unreadCount: state.unreadCount }),
}));

beforeEach(() => {
  state.unreadCount = 0;
  state.pathname = '/';
});

describe('NotificationBell', () => {
  it('is a link to the notification centre, not a panel trigger', () => {
    render(<NotificationBell />);

    const link = screen.getByRole('link', { name: 'الإشعارات' });
    expect(link).toHaveAttribute('href', '/notifications');
    expect(link).not.toHaveAttribute('aria-haspopup');
  });

  it('carries the unread count in its label and its badge', () => {
    state.unreadCount = 4;

    render(<NotificationBell />);

    expect(screen.getByRole('link', { name: 'الإشعارات (4 غير مقروء)' })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('4');
  });

  it('caps a long count, so the badge cannot outgrow the bar', () => {
    state.unreadCount = 120;

    render(<NotificationBell />);

    expect(screen.getByRole('link')).toHaveTextContent('99+');
  });

  it('marks itself current on the page it points at', () => {
    state.pathname = '/notifications';

    render(<NotificationBell />);

    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });
});
