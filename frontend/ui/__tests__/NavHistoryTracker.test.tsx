import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const { mockPathname, mockBack, mockReplace } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => '/'),
  mockBack: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: vi.fn() }),
}));

import { NavHistoryTracker } from '../navbar/NavHistoryTracker';
import {
  canGoBack,
  hasInAppNavigation,
  noteNavigation,
  notePop,
  recordPathname,
  resetInAppNavigation,
} from '../navbar/nav-history';

/** A same-origin link, the way the tab bar and the top nav draw one. */
function link(href: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = href;
  // jsdom has no router: stop the test's own click from becoming a real
  // navigation. The tracker's listener runs on `document` capture, before this.
  anchor.addEventListener('click', (event) => event.preventDefault());
  document.body.append(anchor);
  return anchor;
}

describe('NavHistoryTracker', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
    resetInAppNavigation();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('records the route the page load started on, with nowhere behind it', () => {
    render(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(false);
    expect(canGoBack()).toBe(false);
  });

  it('counts a pushed entry as one step back', () => {
    const { rerender } = render(<NavHistoryTracker />);

    // What Next does for a link: a History API push, then the route renders.
    window.history.pushState({}, '', '/community/some-post');
    mockPathname.mockReturnValue('/community/some-post');
    rerender(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(true);
    expect(canGoBack()).toBe(true);
  });

  it('counts a programmatic push no click could see', () => {
    const { rerender } = render(<NavHistoryTracker />);

    window.history.pushState({}, '', '/chats/c-1');
    mockPathname.mockReturnValue('/chats/c-1');
    rerender(<NavHistoryTracker />);

    expect(canGoBack()).toBe(true);
  });

  it('does not count a re-render of the same route', () => {
    const { rerender } = render(<NavHistoryTracker />);

    rerender(<NavHistoryTracker />);
    rerender(<NavHistoryTracker />);

    expect(hasInAppNavigation()).toBe(false);
  });

  it('walks back into the entry behind instead of pushing a second copy of it', () => {
    // Where Next's own click handler sits: above the link, below `document`.
    const reachedNext = vi.fn();
    document.body.addEventListener('click', reachedNext);

    const { rerender } = render(<NavHistoryTracker />);

    // Home → Community: a real push.
    fireEvent.click(link('/community'));
    window.history.pushState({}, '', '/community');
    mockPathname.mockReturnValue('/community');
    rerender(<NavHistoryTracker />);

    // Community → Home: the tab bar's second press. The page behind is Home, so
    // this is a back, not a third entry — the pair that used to trade places.
    reachedNext.mockClear();
    fireEvent.click(link('/'));
    // A second tap before the traversal lands must not pop the page after it.
    fireEvent.click(link('/'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    // Stopped before Next's own click handler, which would have pushed instead.
    expect(reachedNext).not.toHaveBeenCalled();

    // The traversal itself (the interceptor already noted it as a pop).
    mockPathname.mockReturnValue('/');
    rerender(<NavHistoryTracker />);

    expect(canGoBack()).toBe(false);
    document.body.removeEventListener('click', reachedNext);
  });

  it('takes the stack back down when the browser traverses', () => {
    const { rerender } = render(<NavHistoryTracker />);

    fireEvent.click(link('/chats/c-1'));
    window.history.pushState({}, '', '/chats/c-1');
    mockPathname.mockReturnValue('/chats/c-1');
    rerender(<NavHistoryTracker />);
    expect(canGoBack()).toBe(true);

    // A hardware or browser back press: the entry below this one is the page
    // load's own entry, so nothing of ours is left behind.
    notePop('/');
    mockPathname.mockReturnValue('/');
    rerender(<NavHistoryTracker />);

    expect(canGoBack()).toBe(false);
    expect(hasInAppNavigation()).toBe(true);
  });

  it('leaves an external or modified click to the browser', () => {
    const { rerender } = render(<NavHistoryTracker />);

    const external = link('https://example.com/');
    fireEvent.click(external);

    const modified = link('/community');
    fireEvent.click(modified, { metaKey: true });

    mockPathname.mockReturnValue('/community');
    rerender(<NavHistoryTracker />);

    // Neither was noted, so the commit is not claimed as history of ours.
    expect(canGoBack()).toBe(false);
  });
});

describe('nav history stack', () => {
  beforeEach(() => resetInAppNavigation());

  it('answers that a cold entry has nowhere to go', () => {
    recordPathname('/rates');

    expect(canGoBack()).toBe(false);
  });

  it('grows only for a navigation we witnessed', () => {
    recordPathname('/');
    noteNavigation('push', '/rates');
    recordPathname('/rates');

    expect(canGoBack()).toBe(true);
  });

  it('shrinks when the browser traverses back', () => {
    recordPathname('/');
    noteNavigation('push', '/rates');
    recordPathname('/rates');
    notePop('/');
    recordPathname('/');

    expect(canGoBack()).toBe(false);
  });

  it('never grows for a replace', () => {
    recordPathname('/');
    noteNavigation('replace', '/rates');
    recordPathname('/rates');

    expect(canGoBack()).toBe(false);
  });

  it('does not claim an entry behind for an unwitnessed change', () => {
    recordPathname('/');
    // A redirect, a query change, a programmatic push: none of them tell us
    // that the entry behind is one of ours.
    recordPathname('/privacy');

    expect(canGoBack()).toBe(false);
  });

  it('ignores a note that names another route, so a redirect is not a push', () => {
    recordPathname('/');
    noteNavigation('push', '/old');
    recordPathname('/new');

    expect(canGoBack()).toBe(false);
  });

  it('ignores a trailing slash, so one route is one entry', () => {
    recordPathname('/rates/');
    recordPathname('/rates');

    expect(canGoBack()).toBe(false);
  });

  it('collapses the pair a tab bar makes instead of trading places', () => {
    // Home → Community (push) → Home (back). The second press pops the pair,
    // where the old trail guessed a push and then ping-ponged forever.
    recordPathname('/');
    noteNavigation('push', '/community');
    recordPathname('/community');
    notePop('/');
    recordPathname('/');

    expect(canGoBack()).toBe(false);
  });
});
