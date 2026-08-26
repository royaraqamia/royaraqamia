import { Navbar } from '@/frontend/ui/Navbar';

export function ShellHeader() {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-background/80 supports-backdrop-filter:bg-background/60 border-b border-border/40 transition-all duration-200 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.2)]">
      {/* Reserve space for the fixed Navbar so content isn't hidden beneath it */}
      <div aria-hidden="true" className="h-16 lg:h-20" />

      {/* Primary Navbar */}
      <Navbar />
    </header>
  );
}
