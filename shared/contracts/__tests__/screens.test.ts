import { describe, expect, it } from 'vitest';

import { resolveScreen, screenIsBlind } from '@/shared/contracts/screens';

/**
 * The route table the site's shell publishes from (ADR-0181, decision 2).
 *
 * The table is generated from `perf/surfaces.json`, so these cases are about
 * the matching rules rather than the rows: an exact path, a dynamic segment, a
 * tab of `/`, the whole admin subtree, and the path nothing owns.
 */
describe('resolveScreen', () => {
  it('names the surface a plain route draws', () => {
    expect(resolveScreen('/notes')).toEqual({ screenId: 'notes', product: 'notes', tab: null });
  });

  it('treats `/` as the home screen, and `/` with a tab as the tab’s own surface', () => {
    expect(resolveScreen('/')).toEqual({ screenId: 'home', product: 'home', tab: null });
    expect(resolveScreen('/', '?tab=/notes')).toEqual({
      screenId: 'notes',
      product: 'notes',
      tab: '/notes',
    });
  });

  it('matches a dynamic segment, and keeps the product the surface belongs to', () => {
    expect(resolveScreen('/quran/yasin')).toEqual({
      screenId: 'quran-surah',
      product: 'quran',
      tab: null,
    });
    expect(resolveScreen('/u/ali/followers')?.screenId).toBe('profile');
  });

  it('does not let a dynamic segment stand for a different depth', () => {
    expect(resolveScreen('/quran/yasin/1')).toBeNull();
  });

  it('reads a nested route as its own surface', () => {
    expect(resolveScreen('/account/links')).toEqual({
      screenId: 'account-links',
      product: 'account',
      tab: null,
    });
  });

  it('ignores a trailing slash, and never treats `/` as an empty path', () => {
    expect(resolveScreen('/notes/')?.screenId).toBe('notes');
    expect(resolveScreen('/')?.screenId).toBe('home');
  });

  it('names the whole admin subtree, which is also the surface with no eyes', () => {
    expect(resolveScreen('/admin')?.screenId).toBe('admin');
    expect(resolveScreen('/admin/members/1')?.screenId).toBe('admin');
    expect(screenIsBlind('admin')).toBe(true);
    expect(screenIsBlind('notes')).toBe(false);
  });

  it('answers null for a path the matrix does not carry', () => {
    expect(resolveScreen('/nowhere')).toBeNull();
    // A path that merely starts with a surface's name is not that surface.
    expect(resolveScreen('/notesomething')).toBeNull();
  });
});
