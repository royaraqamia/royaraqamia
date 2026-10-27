'use client';

/**
 * The bundled surface's entry (issue #500).
 *
 * This is the whole of the "bundled" half of the shell: the same components the
 * site renders (`frontend/ui/habitflow/**`, imported, never forked), mounted by
 * Vite instead of the App Router, inside the providers those components read
 * from. `next/*` resolves to the stubs in `./next-shims` (`vite.config.ts`).
 *
 * Deliberately absent, and each absence is a finding rather than an oversight:
 * the site's `RootLayout` chrome (nav, tab bar, players) belongs to the shell,
 * and the route-level providers that only make sense with a server
 * (`PWAProvider`, analytics) would either register a service worker on
 * `https://localhost` or call an endpoint that is not ours.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionProvider } from '@radix-ui/react-direction';

import './spike.css';

import { SessionProvider } from '@/frontend/state/session-provider';
import { MotionRoot } from '@/frontend/ui/MotionRoot';
import { HabitflowPageClient } from '@/frontend/ui/habitflow/components/habitflow-page-client';

import { loadRemoteMechanism } from './crossing';
import { SpikePanel } from './spike-panel';

const container = document.getElementById('spike-root');
if (!container) throw new Error('#spike-root is missing from index.html');

// The persisted crossing choice decides what a bounded navigation does; reading
// it before the first render keeps `useSyncExternalStore` from flashing.
void loadRemoteMechanism().catch(() => {
  // Preferences is unavailable outside Capacitor (a browser preview); the
  // in-memory default is a valid answer there.
});

createRoot(container).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      <SessionProvider>
        {/* `app/habitflow/(app)/layout.tsx` mounts this on the route, not in the
            root layout (#496): `m` throws outside a `LazyMotion`, and without it
            every entry animation stays at its initial style. */}
        <MotionRoot>
          <HabitflowPageClient />
          <SpikePanel />
        </MotionRoot>
      </SessionProvider>
    </DirectionProvider>
  </StrictMode>
);
