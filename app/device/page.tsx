import type { Metadata } from 'next';

import { DeviceView } from '@/frontend/ui/device/device-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'بيانات هذا الجهاز',
  description:
    'ما يحفظه هذا المتصفِّح على هذا الجهاز: ما ينتظر المزامنة، وما فشل منها، وإزالة نسخة الجهاز.',
  alternates: { canonical: '/device' },
};

/**
 * The data-free shell itself (#370, ADR-0070).
 *
 * Deliberately outside `/account`: that prefix is in the worker's never-cache
 * list (ADR-0031), while this page must be a cached document for the moment it
 * is needed — a reload with the radio off. So the server renders no account
 * state at all and `DeviceView` paints the Local Store after mount. What is
 * cached here leaks nothing to the next session on a shared device.
 */
export default function DevicePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 text-center sm:mb-8">
        <SectionTitle as="h1">
          <SectionTitleHighlight>بيانات هذا الجهاز</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <DeviceView />
    </main>
  );
}
