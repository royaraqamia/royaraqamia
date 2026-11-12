'use client';

import { createClient } from '@/frontend/transport/supabase/client';

/**
 * How long the socket waits for an idle frame before it opens anyway. The
 * point is that the connection is not part of the first paint, not that it is
 * late: an idle browser opens it well inside this.
 */
const WARM_TIMEOUT_MS = 2_000;

let scheduled = false;

/**
 * Opens the Realtime socket before a screen needs it (ADR-0169).
 *
 * WhatsApp's shape, and the one this project can hold: the connection belongs
 * to the session, so it is established once the member is known and a thread
 * opened afterwards finds a socket already up. Without it, the first keystroke
 * in a freshly opened thread waits behind a WebSocket handshake, its upgrade,
 * and the topic's join — measured at 2.9 s on production, against 308 ms on a
 * thread whose channel was already live.
 *
 * The work is deferred to an idle callback: nothing here is needed to paint,
 * and a browser that is busy with the route should finish it first. Opening a
 * socket on a member's every page is deliberate — the member can reach chat
 * from every page (ADR-0169) — and guests open none, because the caller asks
 * only once a session exists.
 *
 * Idempotent per page: a provider that mounts twice (React's development
 * double-invoke, a re-render, a returned session) schedules one connection.
 */
export function warmRealtimeSocket(): void {
  if (scheduled) return;
  scheduled = true;

  const open = () => {
    void createClient()
      .then((supabase) => supabase.realtime.connect())
      .catch(() => undefined);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(open, { timeout: WARM_TIMEOUT_MS });
    return;
  }
  setTimeout(open, WARM_TIMEOUT_MS);
}
