'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '../Navbar';
import { SkipToContent } from '../SkipToContent';

export function HabitFlowLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith('/habitflow/app')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col safe-area-inset-top">
      <SkipToContent />
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
    </div>
  );
}
