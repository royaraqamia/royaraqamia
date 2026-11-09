import './app.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'المجتمع',
    template: '%s | رؤيَة رقَميَّة',
  },
  description: 'اقرأ أحدث المنشورات من رؤيَة رقَميَّة.',
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[var(--roy-page-height)] text-foreground flex flex-col">
      <main id="main-content" className="flex-1 container mx-auto px-4 sm:px-6 pt-6 pb-10 sm:pb-14">
        {children}
      </main>
    </div>
  );
}
