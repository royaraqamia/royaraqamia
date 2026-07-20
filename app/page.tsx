import { SkipToContent } from '../components/SkipToContent';
import { Navbar } from '../components/Navbar';
import { HomePageContent } from '../components/HomePageContent';
import { Footer } from '../components/Footer';
import { GoUpButton } from '../components/GoUpButton';
import { WhatsAppFloat } from '../components/WhatsAppFloat';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden w-full max-w-full">
      <SkipToContent />
      <Navbar />
      <HomePageContent />
      <Footer />
      <GoUpButton />
      <WhatsAppFloat />
    </div>
  );
}
