import { z } from 'zod';

import { APP_UPDATE_REQUIRED_CODE } from '@/shared/app-update';

/**
 * The body an owned API answers when the calling app is below the supported
 * floor (ADR-0043, #503).
 *
 * It is typed rather than a bare 426 so the app has one thing to route: the
 * dialog it already owns. `minimumVersionCode` is the counter the floor names,
 * not the newest published one — a device at the newest release can still be
 * below a floor that was raised past it.
 */
export const AppUpdateRequiredSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.literal(APP_UPDATE_REQUIRED_CODE),
  minimumVersionCode: z.number().int().positive(),
});

export type AppUpdateRequired = z.infer<typeof AppUpdateRequiredSchema>;
