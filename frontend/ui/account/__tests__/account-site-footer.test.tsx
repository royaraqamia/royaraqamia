import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/account') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname() as string,
}));

import { AccountSiteFooter } from '../account-site-footer';

describe('AccountSiteFooter', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/account');
  });

  it('carries the site footer on the account area’s front page', () => {
    render(<AccountSiteFooter />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText('رؤيَة رقَميَّة')).toBeInTheDocument();
    expect(screen.getByLabelText('تابعنا على Telegram')).toBeInTheDocument();
  });

  it('stays off every page behind the front one', () => {
    mockPathname.mockReturnValue('/account/posts');

    const { container } = render(<AccountSiteFooter />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays off the other routes', () => {
    mockPathname.mockReturnValue('/');

    const { container } = render(<AccountSiteFooter />);

    expect(container).toBeEmptyDOMElement();
  });
});
