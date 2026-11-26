import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { MemberChatCta } from '../member-chat-cta';

/* Radix Dialog measures content with ResizeObserver; jsdom does not ship it. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(cleanup);

/**
 * A profile is public, but «راسلني» on your own is a conversation with
 * yourself. The page resolves the viewer's standing for the follow control and
 * passes it down, so the button is decided before the first paint (#1375).
 */
describe('MemberChatCta', () => {
  // No `SessionProvider` above it on purpose: the answer came with the page, so
  // the button never waits on a session and never flashes in and back out.
  it('draws the chat action for another member', () => {
    render(<MemberChatCta username="royaraqamia" isSelf={false} signedIn />);

    expect(screen.getByRole('link', { name: /راسلني/ })).toHaveAttribute(
      'href',
      '/chats/new?to=royaraqamia'
    );
  });

  it('draws nothing on the member’s own profile', () => {
    render(<MemberChatCta username="royaraqamia" isSelf signedIn />);

    expect(screen.queryByRole('link', { name: /راسلني/ })).not.toBeInTheDocument();
  });

  it('encodes a handle that needs it, so the thread opens on the member', () => {
    render(<MemberChatCta username="رؤية" isSelf={false} signedIn />);

    expect(screen.getByRole('link', { name: /راسلني/ })).toHaveAttribute(
      'href',
      `/chats/new?to=${encodeURIComponent('رؤية')}`
    );
  });

  it('asks a guest to sign in where they are, returning them to the chat', () => {
    render(<MemberChatCta username="royaraqamia" isSelf={false} signedIn={false} />);

    const cta = screen.getByRole('button', { name: /راسلني/ });
    expect(screen.queryByRole('link', { name: /راسلني/ })).not.toBeInTheDocument();

    fireEvent.click(cta);

    expect(screen.getByText('سجِّل الدُّخول للمتابعة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent('/chats/new?to=royaraqamia')}`
    );
  });
});
