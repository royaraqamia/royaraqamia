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

  it('keeps the account tab active on nested account routes', () => {
    mockPathname.mockReturnValue('/account/submissions');
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: 'حسابي' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders on auth routes', () => {
    mockPathname.mockReturnValue('/auth/login');
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: 'الرَّئيسيَّة' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'المجتمع' })).toHaveAttribute('href', '/community');
    expect(screen.getByRole('link', { name: 'حسابي' })).toHaveAttribute('href', '/account');
  });
});
