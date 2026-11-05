import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

import { NavHistoryTracker } from '../navbar/NavHistoryTracker';
import {
  canGoBack,
  hasInAppNavigation,
  recordPathname,
  resetInAppNavigation,
} from '../navbar/nav-history';

describe('NavHistoryTracker', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
    resetInAppNavigation();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('records the route the page load started on, with nowhere behind it', () => {
    render(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(false);
    expect(canGoBack()).toBe(false);
  });

  it('counts a client-side navigation', () => {
    const { rerender } = render(<NavHistoryTracker />);

    mockPathname.mockReturnValue('/community/some-post');
    rerender(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(true);
    expect(canGoBack()).toBe(true);
  });

  it('does not count a re-render of the same route', () => {
    const { rerender } = render(<NavHistoryTracker />);

    rerender(<NavHistoryTracker />);
    rerender(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(false);
  });

  it('takes the trail back down when the browser returns to an earlier page', () => {
    const { rerender } = render(<NavHistoryTracker />);

    mockPathname.mockReturnValue('/chats/c-1');
    rerender(<NavHistoryTracker />);
    expect(canGoBack()).toBe(true);

    // A traversal back to the entry path is not a new visit, and it leaves no
    // history of ours behind it: the counter is sticky, the trail is not.
    mockPathname.mockReturnValue('/');
    rerender(<NavHistoryTracker />);

    expect(canGoBack()).toBe(false);
    expect(hasInAppNavigation()).toBe(true);
  });
});

describe('nav history trail', () => {
  beforeEach(() => resetInAppNavigation());

  it('answers that a cold entry has nowhere to go', () => {
    recordPathname('/rates');

    expect(canGoBack()).toBe(false);
  });

  it('walks forward through two routes', () => {
    recordPathname('/');
    recordPathname('/rates');

    expect(canGoBack()).toBe(true);
  });

  it('ignores a trailing slash, so one route is one entry', () => {
    recordPathname('/rates/');
    recordPathname('/rates');

    expect(canGoBack()).toBe(false);
  });

  it('never grows past the entry path when back and forward repeat', () => {
    // A → B → back → A → B is two routes trading places, not four entries.
    recordPathname('/');
    recordPathname('/rates');
    recordPathname('/');
    recordPathname('/rates');

    expect(canGoBack()).toBe(true);
    recordPathname('/');
    expect(canGoBack()).toBe(false);
  });
});
