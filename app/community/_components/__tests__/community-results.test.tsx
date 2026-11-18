import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CommunityResults } from '../community-results';

const emptyFeed = {
  path: '/community',
  posts: [],
  nextCursor: null,
  query: '',
  onLoadMore: () => {},
  isLoadingMore: false,
};

describe('CommunityResults', () => {
  it('sends a guest straight to the sign-in page, with the feed as the destination', () => {
    render(<CommunityResults {...emptyFeed} emptyKind="guest" />);

    // The empty state's only action is the page's next step, so it is a link to
    // the sign-in page — not a dialogue that asks the same question first.
    expect(screen.getByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/community'
    );
  });
});
