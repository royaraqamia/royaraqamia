import { describe, it, expect } from 'vitest';

import { HOME_SERVICE_ROUTES, UpdateHomeServicesSchema } from '@/shared/contracts/home-services';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';

/**
 * The catalog the preference stores and the sheet a member sees are one list.
 *
 * The contract cannot import the menu (the menu imports icons and the UI layer),
 * so this test is the seam: a row added to `تطبيقاتنا` without a route here would
 * be an app nobody can add to the homepage, and a route here without a row would
 * be a tab the sheet has no label for.
 */
describe('the homepage apps catalog', () => {
  it('is exactly the sheet’s live rows, in the sheet’s order', () => {
    expect(HOME_SERVICE_ROUTES).toEqual(
      (SERVICES_LINK.subItems ?? [])
        .filter((item) => !item.retired && !item.pickerOnly)
        .map((item) => item.href)
    );
  });

  it('leaves the marketplace out: it is a door, not one of our apps', () => {
    const marketplace = (SERVICES_LINK.subItems ?? []).find((item) => item.href === '/mcp/apps');

    expect(marketplace?.pickerOnly).toBe(true);
    expect(HOME_SERVICE_ROUTES).not.toContain('/mcp/apps');
  });

  it('has no duplicates, so an ordered set can round-trip through the wire', () => {
    expect(new Set(HOME_SERVICE_ROUTES).size).toBe(HOME_SERVICE_ROUTES.length);
  });

  it('leaves the four lead forms out', () => {
    for (const route of ['/request-project', '/hire', '/training/apply', '/consultation/book']) {
      expect(HOME_SERVICE_ROUTES).not.toContain(route);
    }
  });

  it('accepts the whole catalog and refuses a route it does not know', () => {
    expect(UpdateHomeServicesSchema.safeParse({ services: [...HOME_SERVICE_ROUTES] }).success).toBe(
      true
    );
    expect(UpdateHomeServicesSchema.safeParse({ services: ['/admin'] }).success).toBe(false);
    expect(
      UpdateHomeServicesSchema.safeParse({
        services: [...HOME_SERVICE_ROUTES, '/quran'],
      }).success
    ).toBe(false);
  });
});
