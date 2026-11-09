import { HOME_SERVICE_ROUTES, type HomeServiceKey } from '@/shared/contracts/home-services-catalog';

/**
 * A guest's homepage apps, on this device (ADR-0146).
 *
 * The list is the same shape the account stores — an ordered set of routes —
 * so a sign-in merges one into the other without a translation step. A value
 * the catalog no longer has is dropped on read rather than rendered as a tab
 * that cannot open, and a duplicate collapses to its first position.
 *
 * This is a preference, not data: a failed read or a full quota answers the
 * empty list, which is the state a new visitor already sees.
 */
const STORAGE_KEY = 'royaraqamia:home-services:v1';

function sanitize(value: unknown): HomeServiceKey[] {
  if (!Array.isArray(value)) return [];

  const known = new Set<string>(HOME_SERVICE_ROUTES);
  const seen = new Set<string>();

  return value.filter((key): key is HomeServiceKey => {
    if (typeof key !== 'string' || !known.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readGuestHomeServices(): HomeServiceKey[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeGuestHomeServices(keys: readonly HomeServiceKey[]): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(keys)));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestHomeServices(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A preference that cannot be cleared is not worth failing a sign-in for.
  }
}
