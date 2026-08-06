'use client';

import * as React from 'react';
import { Navbar } from '@/frontend/ui/Navbar';
import { CommandPalette } from './command-palette';
import { ProductSwitcher } from './product-switcher';
import { type AppProduct } from './constants';

export function AppShell({
  product,
  children,
}: {
  product: AppProduct;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh flex flex-col bg-background text-foreground antialiased selection:bg-primary/15 selection:text-primary font-sans transition-colors duration-300">
      {/* Subtle ambient lighting effect for a modern SaaS depth feel */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex transform-gpu justify-center overflow-hidden blur-3xl"
      >
        <div className="aspect-1100/400 w-275 flex-none bg-linear-to-tr from-primary/10 via-primary/5 to-transparent opacity-50 dark:opacity-20" />
      </div>

      {/* Accessible Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:font-medium focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200"
      >
        Skip to main content
      </a>

      {/* Unified Sticky Navigation Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-background/80 supports-backdrop-filter:bg-background/60 border-b border-border/40 transition-all duration-200 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.2)]">
        {/* Reserve space for the fixed Navbar so content isn't hidden beneath it */}
        <div aria-hidden="true" className="h-16 lg:h-20" />

        {/* Primary Navbar */}
        <Navbar />

        {/* Sub-Header / Product Switcher & Command Palette Toolbar */}
        <div className="border-t border-border/20 bg-muted/20 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 transition-all duration-200">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <ProductSwitcher current={product} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CommandPalette />
            </div>
          </div>
        </div>
      </header>

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
