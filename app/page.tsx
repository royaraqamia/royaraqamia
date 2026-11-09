import './landing.css';
import type { Metadata } from 'next';
import { SITE_DESCRIPTION } from '@/frontend/shared/metadata';
import { HomePageContent } from '../frontend/ui/HomePageContent';

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
};

export default function HomePage() {
  return (
    <div className="min-h-[var(--roy-page-height)] bg-background text-foreground overflow-x-hidden w-full max-w-full">
      {/* SkipToContent and the top nav come from the root layout (ADR-0149). */}
      {/* The app strip settles in the browser: this page is shared by every
          visitor, so it cannot read an account on the server (ADR-0031). */}
      <HomePageContent />
    </div>
  );
}
