import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

const navigation = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { ScreenContextPublisher } from '@/frontend/ui/ScreenContextPublisher';
import { publishScreen, publishedScreen } from '@/frontend/state/screen-context';
import { SCREEN_CONTEXT_SETTLE_MS } from '@/shared/contracts/screen-context';

/**
 * The route provider (ADR-0181, decision 2 and 3).
 *
 * It publishes nothing until the page settles, and then publishes the page the
 * matrix names — or says it has no eyes, on a screen it may not show.
 */
describe('ScreenContextPublisher', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    navigation.search = '';
    document.title = 'الرئيسية | رؤيَة رقَميَّة';
    publishScreen(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const settle = () => act(() => vi.advanceTimersByTime(SCREEN_CONTEXT_SETTLE_MS));

  it('waits for the page to settle before it publishes anything', () => {
    render(<ScreenContextPublisher />);

    expect(publishedScreen()).toBeNull();

    settle();

    expect(publishedScreen()).toMatchObject({ route: '/', screenId: 'home', product: 'home' });
  });

  it('publishes the screen the matrix gives the route, with the page’s own title', () => {
    navigation.pathname = '/notes';
    document.title = 'الملاحظات | رؤيَة رقَميَّة';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({
      route: '/notes',
      screenId: 'notes',
      product: 'notes',
      title: 'الملاحظات',
    });
  });

  it('publishes the tab the member is on, not just the path they share', () => {
    navigation.pathname = '/';
    navigation.search = '?tab=/quran';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({ screenId: 'quran', tab: '/quran' });
  });

  it('publishes a route it cannot name as route-only, never as an empty claim', () => {
    navigation.pathname = '/dashboard/reports';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({
      route: '/dashboard/reports',
      screenId: '',
      product: 'dashboard',
    });
  });

  it('has no eyes on the admin area: it sends the sentence, not the page', () => {
    navigation.pathname = '/admin/members';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toEqual({ blind: true });
  });

  it('replaces the snapshot when the member moves to another screen', () => {
    const { rerender } = render(<ScreenContextPublisher />);
    settle();
    expect(publishedScreen()).toMatchObject({ screenId: 'home' });

    navigation.pathname = '/notes';
    rerender(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({ screenId: 'notes' });
  });
});
