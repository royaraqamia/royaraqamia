'use client';

import * as React from 'react';
import { ShellHeader } from './shell-header';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh flex flex-col bg-background text-foreground antialiased selection:bg-primary/15 selection:text-primary font-sans transition-colors duration-300">
      {/* Accessible Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:font-medium focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200"
      >
        Skip to main content
      </a>

      {/* Unified Sticky Navigation Header */}
      <ShellHeader />

      {/* Main Content Viewport */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 focus:outline-none"
      >
        <div className="w-full h-full transition-all duration-300">{children}</div>
      </main>
    </div>
  );
}
