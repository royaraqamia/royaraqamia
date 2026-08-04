'use client';

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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Navbar />
      <div className="h-20" aria-hidden="true" />
      <div className="sticky top-16 z-40 border-b border-border/10 bg-background/80 backdrop-blur-md">
        <div className="container-padding mx-auto flex w-full max-w-6xl items-center justify-between gap-3 py-2.5">
          <ProductSwitcher current={product} />
          <CommandPalette />
        </div>
      </div>
      <main className="container-padding mx-auto w-full max-w-6xl flex-1 pb-8 pt-8">
        {children}
      </main>
    </div>
  );
}
