import { describe, it, expect } from 'vitest';

import { SERVICE_ROUTES, UpdateHiddenServicesSchema } from '@/shared/contracts/hidden-services';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';

/**
 * The catalog the preference stores and the menu a user sees are one list.
 *
 * The contract cannot import the menu (the menu imports icons and the UI layer),
 * so this test is the seam: a row added to `خدماتنا` without a route here would
 * be a service nobody can hide, and a route here without a row would be an entry
 * the settings page has no label for.
 */
describe('the hidden-services catalog', () => {
  it('is exactly the menu’s rows, in the menu’s order', () => {
    expect(SERVICE_ROUTES).toEqual((SERVICES_LINK.subItems ?? []).map((item) => item.href));
  });

  it('has no duplicates, so a set can round-trip through the wire', () => {
    expect(new Set(SERVICE_ROUTES).size).toBe(SERVICE_ROUTES.length);
  });

  it('accepts the whole catalog and refuses a route it does not know', () => {
    expect(UpdateHiddenServicesSchema.safeParse({ hidden: [...SERVICE_ROUTES] }).success).toBe(
      true
    );
    expect(UpdateHiddenServicesSchema.safeParse({ hidden: ['/admin'] }).success).toBe(false);
  });
});
