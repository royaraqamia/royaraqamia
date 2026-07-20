import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { GoUpButton } from '@/components/GoUpButton';
import { WhatsAppFloat } from '@/components/WhatsAppFloat';

export const metadata: Metadata = {
  title: {
    default: 'المدونة',
    template: '%s | BlogPress',
  },
  description: 'اقرأ أحدث المقالات من BlogPress.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main
        id="main-content"
        className="flex-1 pt-24 container mx-auto px-4 sm:px-6 pb-10 sm:pb-14"
      >
        {children}
      </main>
      <Footer />
      <GoUpButton />
      <WhatsAppFloat />
    </div>
  );
}
