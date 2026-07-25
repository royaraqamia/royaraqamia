import type { Metadata } from 'next';
import { SITE_DESCRIPTION } from '@/lib/metadata';
import { SkipToContent } from '../components/SkipToContent';
import { Navbar } from '../components/Navbar';
import { HomePageContent } from '../components/HomePageContent';
import { Footer } from '../components/Footer';

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden w-full max-w-full">
      <SkipToContent />
      <Navbar />
      <HomePageContent />
      <Footer />
    </div>
  );
}
