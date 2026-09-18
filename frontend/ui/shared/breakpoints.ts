/**
 * Mirrors Tailwind's default `sm` breakpoint (40rem / 640px).
 *
 * Keep in sync with the `--breakpoint-sm` token if the theme ever customises it;
 * this module exists so JS media-query logic doesn't hard-code the value twice.
 */
export const SM_BREAKPOINT_PX = 640;

/** Matches viewports strictly below Tailwind's `sm` breakpoint. */
export const BELOW_SM_MEDIA_QUERY = `(max-width: ${SM_BREAKPOINT_PX - 1}px)`;
