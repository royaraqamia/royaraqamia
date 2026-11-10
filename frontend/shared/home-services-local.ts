import {
  HOME_SERVICE_ROUTES,
  isHomeServiceKey,
  type HomeServiceKey,
} from '@/shared/contracts/home-services-catalog';

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

/**
 * The app the door is showing (`/` hosts every tab, ADR-0151).
 *
 * It is a device preference like the strip: the selection is a view, not
 * account data, and it is only read to keep a reload on the tab the member was
 * last in. A value the catalog no longer has falls back to the first app.
 *
 * A `?tab=` on the address wins over the remembered one (ADR-0156): it is how a
 * bookmark, a shared link and a retired app route name the tab they want. The
 * value is the tab's own key — `/linksnap` — so the address, the strip and the
 * catalog spell the app the same way.
 */
const TAB_KEY = 'royaraqamia:home-tab:v1';

/**
 * The `?tab=` on the address, when it is a tab the catalog knows.
 *
 * Separate from the remembered tab because the two mean different things: the
 * address asks for this app now, while the preference is only what a plain `/`
 * should paint (ADR-0156).
 */
export function readRequestedHomeTab(): HomeServiceKey | null {
  if (typeof window === 'undefined') return null;

  try {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return isHomeServiceKey(requested) ? requested : null;
  } catch {
    return null;
  }
}

export function readHomeTab(): HomeServiceKey | null {
  if (typeof window === 'undefined') return null;

  const requested = readRequestedHomeTab();
  if (requested) return requested;

  try {
    const raw = window.localStorage.getItem(TAB_KEY);
    return isHomeServiceKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeHomeTab(key: HomeServiceKey): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(TAB_KEY, key);
  } catch {
    // The door still opens the tab this visit; only the reload preference is lost.
  }
}
