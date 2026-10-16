import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

import { NavHistoryTracker } from '../navbar/NavHistoryTracker';
import { hasInAppNavigation, resetInAppNavigation } from '../navbar/nav-history';

describe('NavHistoryTracker', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
    resetInAppNavigation();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('counts nothing for the route the page load started on', () => {
    render(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(false);
  });

  it('counts a client-side navigation', () => {
    const { rerender } = render(<NavHistoryTracker />);

    mockPathname.mockReturnValue('/community/some-post');
    rerender(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(true);
  });

  it('does not count a re-render of the same route', () => {
    const { rerender } = render(<NavHistoryTracker />);

    rerender(<NavHistoryTracker />);
    rerender(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(false);
  });
});
