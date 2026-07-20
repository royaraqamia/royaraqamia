import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { SkipToContent } from '@/components/SkipToContent';

export default function SpendTrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SkipToContent />
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
