'use client';

import * as React from 'react';
import { GuestModeBanner } from '@/frontend/ui/app-shell/guest-mode-banner';

/**
 * The shell the product apps (BlogPress, LinkSnap, HabitFlow, SpendTrack) mount
 * their dashboards in. Every one of them is a secondary page, so the chrome
 * around this content — the back header, and the absence of the tab bar — comes
 * from the route-aware pieces in the root layout, not from here.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh flex flex-col bg-background text-foreground antialiased selection:bg-primary/15 selection:text-primary font-sans transition-colors duration-300 pt-16 lg:pt-20">
      {/* Main Content Viewport */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 focus:outline-none"
      >
        <GuestModeBanner />
        <div className="w-full h-full transition-safe duration-300">{children}</div>
      </main>
    </div>
  );
}
