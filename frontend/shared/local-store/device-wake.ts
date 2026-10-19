import { logger } from '@/frontend/shared/logger';
import { readNativePushToken } from '@/frontend/shared/native-push-token';

/**
 * Telling the account's *other* devices that this one just wrote (ADR-0059,
 * ADR-0060).
 *
 * The foreground twin of this is Supabase Realtime: a device with the app open
 * hears about a change on its own socket. The background twin cannot hear
 * anything — a closed shell's socket is gone — so the server has to be asked to
 * wake it with a silent FCM data message. The only moment a device *knows* the
 * account moved is when its own drain delivered a write, which is why this is
 * asked for from the drain and nowhere else: a pull learns something, a commit
 * announces it.
 *
 * Fire-and-forget by design. A wake is latency, never correctness: the other
 * device's own periodic floor, its next open and its focus pull all still run,
 * so a request the network drops costs the reminder it would have been. Nothing
 * here may throw into a flush, and nothing here carries state — the receiver
 * answers a wake by pulling.
 */

/** Where a realm that cannot see the account asks for its devices to be woken. */
export const DEVICE_WAKE_PATH = '/api/push/wake';

/**
 * A flush replays many intents at once and every write is its own flush, so a
 * burst of commits folds into one wake.
 */
const WAKE_DEBOUNCE_MS = 750;

/**
 * A floor between requests. The devices were told a moment ago and one wake
 * covers every commit in the window; without it, someone editing steadily would
 * buzz their own phone on a loop.
 */
const WAKE_COOLDOWN_MS = 30_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastWokeAt = 0;

interface WakeDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

async function sendDeviceWake(deps: WakeDeps): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  lastWokeAt = now();

  try {
    await fetchImpl(DEVICE_WAKE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The shell sends its own token so the server leaves the writer out; a
      // browser tab has none, and wakes every native device on the account.
      body: JSON.stringify({ token: readNativePushToken() }),
      cache: 'no-store',
    });
  } catch (error) {
    logger.warn('Failed to wake the account’s other devices', { error: String(error) });
  }
}

/**
 * Asks the server to wake the account's other devices. Never throws, never
 * blocks, and collapses a burst into one request.
 */
export function requestDeviceWake(deps: WakeDeps = {}): void {
  const now = deps.now ?? Date.now;
  if (now() - lastWokeAt < WAKE_COOLDOWN_MS) return;

  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void sendDeviceWake(deps);
  }, WAKE_DEBOUNCE_MS);
}

/** Test seam: forgets the throttle so a spec starts from a quiet account. */
export function resetDeviceWakeThrottle(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  lastWokeAt = 0;
}
