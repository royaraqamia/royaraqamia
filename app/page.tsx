import './landing.css';
import type { Metadata } from 'next';
import { SITE_DESCRIPTION } from '@/frontend/shared/metadata';
import { ServiceDiscountProvider } from '@/frontend/ui/plans/pro-price';
import { Navbar } from '../frontend/ui/Navbar';
import { HomePageContent } from '../frontend/ui/HomePageContent';

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden w-full max-w-full">
      {/* SkipToContent moved to Navbar */}
      <Navbar />
      {/* The service prices settle in the browser: this page is shared by
          every visitor, so it cannot read an account on the server. */}
      <ServiceDiscountProvider>
        <HomePageContent />
      </ServiceDiscountProvider>
    </div>
  );
}
