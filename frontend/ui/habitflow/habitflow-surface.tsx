'use client';

import '@/app/habitflow/app.css';
import { Suspense } from 'react';

import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { HabitflowPageClient } from '@/frontend/ui/habitflow/components/habitflow-page-client';

/**
 * The app's content without the route frame: the route draws it inside its
 * layout, and the homepage under the strip (ADR-0151).
 */
export function HabitflowSurface() {
  return (
    <>
      <header className="mb-6 text-center sm:mb-10">
        <SectionTitle as="h1">
          <SectionTitleHighlight>تتبُّع العادات</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <Suspense fallback={null}>
        <HabitflowPageClient />
      </Suspense>
    </>
  );
}
