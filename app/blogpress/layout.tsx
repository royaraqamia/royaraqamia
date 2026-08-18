import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/frontend/ui/Navbar';
import { Footer } from '@/frontend/ui/Footer';
import { SkipToContent } from '@/frontend/ui/SkipToContent';

export const metadata: Metadata = {
  title: {
    default: 'BlogPress',
    template: '%s | BlogPress',
  },
};

export default function BlogPressLayout({ children }: { children: React.ReactNode }) {
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
