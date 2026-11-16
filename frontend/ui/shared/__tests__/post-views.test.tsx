import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PostViews } from '../post-views';

/**
 * Views are a fact about a post, drawn on the meta line (not in the action row),
 * and they say nothing at all until there is something to say.
 */
describe('PostViews', () => {
  it('renders the tally with a spoken label the eye icon cannot carry', () => {
    render(<PostViews count={128} />);
    expect(screen.getByLabelText('128 مشاهدة')).toBeInTheDocument();
  });

  it('renders nothing for a post nobody has opened', () => {
    const { container } = render(<PostViews count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
