import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FollowBadge } from '../follow-badge';

/**
 * The one line about the viewer on someone else's profile (ADR-0201).
 *
 * It is silence in three cases - no reverse edge, your own profile, a block -
 * and each of them is a case a wrong default would turn into a claim.
 */
describe('FollowBadge', () => {
  it('says the member follows you', () => {
    render(<FollowBadge state="not_following" followsYou />);
    expect(screen.getByText('يتابعك')).toBeInTheDocument();
  });

  it('says the two of you follow each other', () => {
    render(<FollowBadge state="following" followsYou />);
    expect(screen.getByText('تتابعان بعضكما')).toBeInTheDocument();
  });

  it('renders nothing when the member does not follow you', () => {
    const { container } = render(<FollowBadge state="not_following" followsYou={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on your own profile', () => {
    const { container } = render(<FollowBadge state="self" followsYou />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing between a blocked pair', () => {
    const { container } = render(<FollowBadge state="blocked" followsYou />);
    expect(container).toBeEmptyDOMElement();
  });
});
