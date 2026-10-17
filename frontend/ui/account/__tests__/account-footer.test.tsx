import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/account') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname() as string,
}));

import { AccountFooter } from '../account-footer';

describe('AccountFooter', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/account');
  });

  it('names the installed version on the account area’s front page', () => {
    const { container } = render(<AccountFooter version="1.0.7" />);

    expect(container.querySelector('[data-account-footer]')).toHaveTextContent('1.0.7');
    expect(screen.queryByText('20007')).not.toBeInTheDocument();
  });

  it('stays off every page behind the front one', () => {
    mockPathname.mockReturnValue('/account/posts');
    const { container } = render(<AccountFooter version="1.0.7" />);

    expect(container.querySelector('[data-account-footer]')).toBeNull();
  });

  it('renders nothing without a name to show', () => {
    // A browser sends no shell token, and a shell built before it carried a name
    // has no name to show.
    const { container } = render(<AccountFooter version={null} />);

    expect(container.querySelector('[data-account-footer]')).toBeNull();
  });
});
