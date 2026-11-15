import type { ScreenScope } from '@/frontend/state/screen-scopes';

/**
 * What LinkSnap registers (ADR-0181, #1420).
 *
 * The root is the shortener and the unlock page is the door a protected link
 * opens: both register the screen and nothing more. The URL a member is typing,
 * the links in their list and the password on the unlock form are not
 * candidates — the unlock surface has an allowlist with no fields at all
 * (decision 4), and a link's target is the member's own row.
 */
export function linksnapScreenScope(): ScreenScope {
  return { id: 'linksnap.page', kind: 'screen' };
}

export function linksnapUnlockScope(): ScreenScope {
  return { id: 'linksnap-unlock.page', kind: 'screen' };
}
