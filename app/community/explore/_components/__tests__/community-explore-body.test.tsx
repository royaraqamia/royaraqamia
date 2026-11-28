import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * The hub's order is a product decision (#1952), not a styling detail: the feed
 * comes before the roster, so the first interactive block a reader meets is
 * something to read. The children are stubs because this file asserts ordering;
 * their own suites cover what they draw.
 */
vi.mock('@/app/community/_components/community-search', () => ({
  CommunitySearch: () => <div data-testid="explore-search" />,
}));

vi.mock('@/app/community/_components/community-index-results', () => ({
  CommunityIndexResults: () => <div data-testid="explore-feed" />,
}));

vi.mock('@/app/community/_components/community-members-responsive', () => ({
  ResponsiveCommunityMembersStrip: ({ members }: { members: unknown[] }) => (
    <div data-testid="explore-roster-strip" data-count={members.length} />
  ),
  ResponsiveCommunityMembersPanel: ({ members }: { members: unknown[] }) => (
    <div data-testid="explore-roster-panel" data-count={members.length} />
  ),
}));

import { CommunityExploreBody } from '../community-explore-body';

function precedes(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('CommunityExploreBody', () => {
  it('renders the feed above the roster', () => {
    render(
      <CommunityExploreBody
        posts={[]}
        nextCursor={null}
        members={[{ id: 'u-1', username: 'ahmad' } as never]}
      />
    );

    const feed = screen.getByTestId('explore-feed');
    const strip = screen.getByTestId('explore-roster-strip');
    const panel = screen.getByTestId('explore-roster-panel');

    expect(precedes(feed, strip)).toBe(true);
    expect(precedes(feed, panel)).toBe(true);
    expect(precedes(strip, panel)).toBe(true);
  });

  it('hands the roster an empty list when there is no supply, so it draws nothing', () => {
    render(<CommunityExploreBody posts={[]} nextCursor={null} members={[]} />);

    // The roster components return null for an empty list (their own suite), so
    // an empty supply leaves the page with no roster at all.
    expect(screen.getByTestId('explore-roster-strip')).toHaveAttribute('data-count', '0');
  });
});
