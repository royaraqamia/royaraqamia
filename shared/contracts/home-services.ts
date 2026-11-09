import { z } from 'zod';

import { HOME_SERVICE_ROUTES, type HomeServiceKey } from '@/shared/contracts/home-services-catalog';

export { HOME_SERVICE_ROUTES, type HomeServiceKey };

/**
 * The apps a member keeps on the homepage (ADR-0146).
 *
 * The key is the app's **route**, exactly as both clients spell it
 * (`SERVICES_LINK.subItems[].href` on the site, `ServicesEntry.route` in the
 * shell), so an app retired from the catalog leaves a stored row that no client
 * matches — harmless — rather than a key that has to be migrated.
 *
 * Eleven apps, and only these: the four lead forms left the sheet (ADR-0148),
 * and a key outside this list is refused at the edge.
 */
export const HomeServiceKeySchema = z.enum(HOME_SERVICE_ROUTES);

/**
 * The write is the whole ordered set, not a delta: the strip is a list and its
 * truth is "these are the tabs, in this order", so a replace is the operation
 * that cannot drift. Order is the tab order.
 */
export const UpdateHomeServicesSchema = z.object({
  services: z.array(HomeServiceKeySchema).max(HOME_SERVICE_ROUTES.length),
});

export type UpdateHomeServices = z.infer<typeof UpdateHomeServicesSchema>;

/**
 * The read answers the routes this member keeps, in tab order, or says it could
 * not. `data` is a plain string list on purpose: a value the catalog no longer
 * has is ignored by a client, not a whole read turned into a contract failure.
 */
export const HomeServicesResultSchema = z.object({
  success: z.boolean(),
  data: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type HomeServicesResult = z.infer<typeof HomeServicesResultSchema>;
