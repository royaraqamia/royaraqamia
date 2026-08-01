import type { Metadata } from 'next';
import { SITE_DESCRIPTION } from '@/frontend/shared/metadata';
import { Navbar } from '../components/Navbar';
import { HomePageContent } from '../components/HomePageContent';
import { Footer } from '../components/Footer';

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden w-full max-w-full">
      {/* SkipToContent moved to Navbar */}
      <Navbar />
      <HomePageContent />
      <Footer />
    </div>
  );
}
