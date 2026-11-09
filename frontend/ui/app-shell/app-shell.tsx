'use client';

import * as React from 'react';
import { GuestModeBanner } from '@/frontend/ui/app-shell/guest-mode-banner';

/**
 * The shell the product apps (LinkSnap, HabitFlow, SpendTrack, Notes) mount
 * their dashboards in. Their roots wear the app chrome (ADR-0149) — the top nav,
 * the bottom tab bar and the floating back control come from the route-aware
 * pieces in the root layout — and their drill-downs drop to the back control.
 *
 * The bottom padding is the room the tab bar occupies: a root's last row must
 * stay above it, not under it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[var(--roy-page-height)] flex flex-col bg-background text-foreground antialiased selection:bg-primary/15 selection:text-primary font-sans transition-colors duration-300">
      {/* Main Content Viewport */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 sm:pt-8 sm:pb-32 lg:pt-10 lg:pb-32 focus:outline-none"
      >
        <GuestModeBanner />
        <div className="w-full h-full transition-safe duration-300">{children}</div>
      </main>
    </div>
  );
}
