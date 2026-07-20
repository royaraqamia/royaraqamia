import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { GoUpButton } from '@/components/GoUpButton';
import { WhatsAppFloat } from '@/components/WhatsAppFloat';

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        {children}
      </main>
      <Footer />
      <GoUpButton />
      <WhatsAppFloat />
    </div>
  );
}
