import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { SkipToContent } from '@/components/SkipToContent';

export const metadata: Metadata = {
  title: 'LinkSnap',
  description: 'اختصر روابطك الطَّويلة وتتبَّع أداءها بسهولة مع LinkSnap من رؤية رقمية.',
};

export default function LinkSnapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col safe-area-inset-top">
      <SkipToContent />
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
