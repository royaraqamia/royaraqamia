import './app.css';
import type { Metadata } from 'next';

/**
 * The reader's shell. Metadata that belongs to one page lives on that page, so
 * this only fixes the title template and the page frame — the same shape
 * `app/quran/layout.tsx` and `app/scan/layout.tsx` use.
 */
export const metadata: Metadata = {
  title: {
    default: 'أذكار الصَّباح والمساء',
    template: '%s | رؤيَة رقَميَّة',
  },
};

export default function AthkarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <main id="main-content" className="flex-1 pt-6">
        {children}
      </main>
    </div>
  );
}
