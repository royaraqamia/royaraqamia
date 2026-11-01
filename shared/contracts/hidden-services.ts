import { z } from 'zod';

/**
 * A member's hidden services — the one preference `خدماتنا` reads (ADR-0112).
 *
 * The key is the row's **route**, not a name this file invents: the menu already
 * identifies a row by where it goes (`SERVICES_LINK.subItems[].href` on the site,
 * `ServicesEntry.route` in the shell), so a route retired from the menu leaves a
 * stored row that no client matches — harmless — rather than a key that has to be
 * migrated. A test asserts [SERVICE_ROUTES] is exactly the menu's rows.
 */
export const HiddenServiceKeySchema = z.enum([
  '/request-project',
  '/hire',
  '/news',
  '/training/apply',
  '/verify',
  '/consultation/book',
  '/rates',
  '/downloader',
  '/scan',
  '/quran',
  '/athkar',
  '/linksnap',
  '/habitflow',
  '/spendtrack',
  '/notes',
  '/mcp/guide',
]);

export type HiddenServiceKey = z.infer<typeof HiddenServiceKeySchema>;

/** The catalog, in the menu's order. */
export const SERVICE_ROUTES: readonly HiddenServiceKey[] = HiddenServiceKeySchema.options;

/**
 * The write: the whole set, not a delta. The settings page is a list of toggles
 * and its truth is "these are off", so a replace is the operation that cannot
 * drift — a POST of one key and a DELETE of another would need the server to
 * guess what an interrupted page meant.
 */
export const UpdateHiddenServicesSchema = z.object({
  hidden: z.array(HiddenServiceKeySchema).max(SERVICE_ROUTES.length),
});

export type UpdateHiddenServices = z.infer<typeof UpdateHiddenServicesSchema>;

/**
 * The read answers the routes this member hid, or says it could not.
 *
 * `data` is a plain string list on purpose: the shell filters a menu by string,
 * and a value the catalog no longer has should be ignored by a client, not turn a
 * whole read into a contract failure. The write above is where the catalog is
 * enforced.
 */
export const HiddenServicesResultSchema = z.object({
  success: z.boolean(),
  data: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type HiddenServicesResult = z.infer<typeof HiddenServicesResultSchema>;
