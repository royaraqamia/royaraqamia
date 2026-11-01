import type { Metadata } from 'next';

import { ChangelogView } from '@/frontend/ui/account/changelog-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'ما الجديد',
  description: 'ملاحظات إصدارات تطبيق الأندرويد.',
};

/**
 * Rendered per request, on purpose. The page exists to show the *newest*
 * release notes, and the precache list is a measured budget (ADR-0071) that
 * this route would push past its 33-shell cap, dropping `/verify`'s shell. A
 * frozen shell would also pin an old list — the one thing this page must not do.
 * It reads no cookies and no `searchParams`, so the surface is still a shell; it
 * is just not a precached one (see `DYNAMIC_BY_DESIGN`).
 */
export const dynamic = 'force-dynamic';

export default function AccountChangelogPage() {
  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>ما الجديد</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <ChangelogView />
    </div>
  );
}
