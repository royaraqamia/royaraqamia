import type { Metadata } from 'next';
import './quran.css';
import { amiriQuran } from '@/frontend/ui/quran/font';

/**
 * The reader's shell. Metadata that belongs to one page lives on that page — the
 * canonical URL of a sura is not the canonical URL of the index — so this only
 * fixes the title template and the page frame.
 *
 * The display font's variable is set here rather than on `<html>` so its
 * `@font-face` stays in this route's CSS instead of being shipped to every page
 * in the site.
 */
export const metadata: Metadata = {
  title: {
    default: 'القرآن الكريم',
    template: '%s | رؤيَة رقَميَّة',
  },
};

export default function QuranLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`min-h-dvh bg-background text-foreground flex flex-col ${amiriQuran.variable}`}>
      <main id="main-content" className="flex-1 pt-6">
        {children}
      </main>
    </div>
  );
}
