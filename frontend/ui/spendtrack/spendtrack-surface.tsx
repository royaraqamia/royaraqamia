'use client';

import '@/app/spendtrack/app.css';
import { Suspense } from 'react';

import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SpendtrackPageClient } from '@/frontend/ui/spendtrack/spendtrack-page-client';

/**
 * The app's content without the route frame: the route draws it inside its
 * layout, and the homepage under the strip (ADR-0151).
 */
export function SpendtrackSurface() {
  return (
    <div className="space-y-6 pb-8">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>تتبُّع المصاريف</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <Suspense fallback={null}>
        <SpendtrackPageClient />
      </Suspense>
    </div>
  );
}
