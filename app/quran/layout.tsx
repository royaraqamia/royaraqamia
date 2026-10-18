import type { Metadata } from 'next';

/**
 * The reader's shell. Metadata that belongs to one page lives on that page — the
 * canonical URL of a sura is not the canonical URL of the index — so this only
 * fixes the title template and the page frame.
 */
export const metadata: Metadata = {
  title: {
    default: 'القرآن الكريم',
    template: '%s | رؤيَة رقَميَّة',
  },
};

export default function QuranLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <main id="main-content" className="flex-1 pt-6">
        {children}
      </main>
    </div>
  );
}
