import { Navbar } from '@/frontend/ui/Navbar';
import { CommandPalette } from './command-palette';
import { ProductSwitcher } from './product-switcher';
import { type AppProduct } from './constants';

export function ShellHeader({ product }: { product?: AppProduct }) {
  return (
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
  );
}
