/**
 * The parts of the Android update channel that both sides read (ADR-0043,
 * ADR-0044).
 *
 * The shell names itself in its user agent, the site compares that counter with
 * the manifest beside it, and the server answers an app below the supported floor
 * with the typed status below. Keeping the token, the paths and the status in one
 * module is what stops the server, the page and the app from spelling the channel
 * three ways.
 */

export const SHELL_USER_AGENT_TOKEN = 'RoyaraqamiaShell';
export const SHELL_MANIFEST_PATH = '/android/latest.json';

/** The status HTTP reserves for "this client must upgrade before it can continue". */
export const APP_UPDATE_REQUIRED_STATUS = 426;
/** The body's discriminator, so a 426 is not mistaken for another refusal. */
export const APP_UPDATE_REQUIRED_CODE = 'app_update_required';

/**
 * Both spellings, in one pattern, with the trailing guard that makes the
 * difference: without `(?![\d.])` the counter would be read out of the *name*
 * (`1.0.3+20003` would answer "1", and a shell at 1.0.3 would look like a shell
 * from before the counter existed).
 */
const SHELL_TOKEN_PATTERN = new RegExp(
  `${SHELL_USER_AGENT_TOKEN}/(?:(\\d+\\.\\d+\\.\\d+)\\+)?(\\d+)(?![\\d.])`
);

/** The shell version a user agent names, or null when this is not the shell. */
export function shellVersionFromUserAgent(userAgent: string): number | null {
  const match = SHELL_TOKEN_PATTERN.exec(userAgent);
  if (!match || match[2] === undefined) return null;
  const code = Number(match[2]);
  return Number.isInteger(code) ? code : null;
}

/** The installed app version a user agent names, or null on a shell too old to say. */
export function shellVersionNameFromUserAgent(userAgent: string): string | null {
  const match = SHELL_TOKEN_PATTERN.exec(userAgent);
  return match?.[1] ?? null;
}
