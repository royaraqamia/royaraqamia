import { describe, expect, it } from 'vitest';

import { accountScreenScope } from '@/frontend/ui/account/account-screen-scope';

/**
 * The account subtree's registrations (ADR-0181, #1421).
 *
 * The layout registers one scope per page from the pathname, so this is the one
 * place the mapping can be wrong: a path the table misses publishes route-only,
 * and a path it names wrongly tells the turn the member is somewhere else.
 */
describe('accountScreenScope', () => {
  it('names each account page by the surface the matrix gives it', () => {
    expect(accountScreenScope('/account')?.id).toBe('account.page');
    expect(accountScreenScope('/account/links')?.id).toBe('account-links.page');
    expect(accountScreenScope('/account/posts')?.id).toBe('account-posts.page');
    expect(accountScreenScope('/account/submissions')?.id).toBe('account-submissions.page');
    expect(accountScreenScope('/account/plan')?.id).toBe('account-plan.page');
    expect(accountScreenScope('/account/connected-apps')?.id).toBe('account-connected-apps.page');
    expect(accountScreenScope('/account/blocked')?.id).toBe('account-blocked.page');
    expect(accountScreenScope('/account/faq')?.id).toBe('account-faq.page');
    expect(accountScreenScope('/account/news')?.id).toBe('account-news.page');
  });

  it('reads a trailing slash as the page it names', () => {
    expect(accountScreenScope('/account/')?.id).toBe('account.page');
    expect(accountScreenScope('/account/posts/')?.id).toBe('account-posts.page');
  });

  it('registers nothing outside the subtree or for a path it does not carry', () => {
    expect(accountScreenScope('/')).toBeNull();
    expect(accountScreenScope('/community')).toBeNull();
    expect(accountScreenScope('/account/settings')).toBeNull();
  });

  it('never reads an inherited property as a screen', () => {
    expect(accountScreenScope('/account/constructor')).toBeNull();
    expect(accountScreenScope('/constructor')).toBeNull();
  });
});
