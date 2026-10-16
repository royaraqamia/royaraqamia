import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname() as string,
}));

import { BottomTabBar } from '../navbar/BottomTabBar';

describe('BottomTabBar', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
  });

  it('renders the three tabs', () => {
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: 'الرَّئيسيَّة' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'المجتمع' })).toHaveAttribute('href', '/community');
    expect(screen.getByRole('link', { name: 'حسابي' })).toHaveAttribute('href', '/account');
  });

  it('marks the active tab', () => {
    mockPathname.mockReturnValue('/community');
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: 'المجتمع' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'حسابي' })).not.toHaveAttribute('aria-current');
  });

  it('renders nothing on a secondary page', () => {
    mockPathname.mockReturnValue('/community/some-post');
    render(<BottomTabBar />);
    expect(
      screen.queryByRole('navigation', { name: 'التَّنقُّل السُّفليّ' })
    ).not.toBeInTheDocument();
  });

  it.each(['/auth/login', '/account/posts', '/admin', '/rates'])(
    'stays out of the way on %s',
    (pathname) => {
      mockPathname.mockReturnValue(pathname);
      render(<BottomTabBar />);
      expect(screen.queryByRole('link', { name: 'الرَّئيسيَّة' })).not.toBeInTheDocument();
    }
  );
});
