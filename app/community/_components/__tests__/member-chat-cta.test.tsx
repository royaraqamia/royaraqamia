import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  session: {
    user: null as { id: string } | null,
    profileUsername: null as string | null,
    isLoading: false,
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

import { MemberChatCta } from '../member-chat-cta';

beforeEach(() => {
  mocks.session.user = null;
  mocks.session.profileUsername = null;
  mocks.session.isLoading = false;
});

afterEach(cleanup);

/**
 * A profile is public, but «مراسلة» on your own is a conversation with
 * yourself: the button is decided on the client so the page stays the shared,
 * revalidated document it is.
 */
describe('MemberChatCta', () => {
  it('draws the chat action for another member', () => {
    mocks.session.user = { id: 'u1' };
    mocks.session.profileUsername = 'sara';
    render(<MemberChatCta username="royaraqamia" />);

    expect(screen.getByRole('link', { name: /مراسلة/ })).toHaveAttribute(
      'href',
      '/chats/new?to=royaraqamia'
    );
  });

  it('draws nothing on the member’s own profile', () => {
    mocks.session.user = { id: 'u1' };
    mocks.session.profileUsername = 'Royaraqamia';
    render(<MemberChatCta username="royaraqamia" />);

    expect(screen.queryByRole('link', { name: /مراسلة/ })).not.toBeInTheDocument();
  });

  it('waits for the session before deciding, so the first paint is the document', () => {
    mocks.session.user = null;
    mocks.session.profileUsername = null;
    mocks.session.isLoading = true;
    render(<MemberChatCta username="royaraqamia" />);

    expect(screen.queryByRole('link', { name: /مراسلة/ })).not.toBeInTheDocument();
  });
});
