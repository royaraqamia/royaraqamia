import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { MemberChatCta } from '../member-chat-cta';

afterEach(cleanup);

/**
 * A profile is public, but «مراسلة» on your own is a conversation with
 * yourself. The page resolves the viewer's standing for the follow control and
 * passes it down, so the button is decided before the first paint (#1375).
 */
describe('MemberChatCta', () => {
  // No `SessionProvider` above it on purpose: the answer came with the page, so
  // the button never waits on a session and never flashes in and back out.
  it('draws the chat action for another member', () => {
    render(<MemberChatCta username="royaraqamia" isSelf={false} />);

    expect(screen.getByRole('link', { name: /مراسلة/ })).toHaveAttribute(
      'href',
      '/chats/new?to=royaraqamia'
    );
  });

  it('draws nothing on the member’s own profile', () => {
    render(<MemberChatCta username="royaraqamia" isSelf />);

    expect(screen.queryByRole('link', { name: /مراسلة/ })).not.toBeInTheDocument();
  });

  it('encodes a handle that needs it, so the thread opens on the member', () => {
    render(<MemberChatCta username="رؤية" isSelf={false} />);

    expect(screen.getByRole('link', { name: /مراسلة/ })).toHaveAttribute(
      'href',
      `/chats/new?to=${encodeURIComponent('رؤية')}`
    );
  });
});
