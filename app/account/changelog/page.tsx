import type { Metadata } from 'next';

import { CHANGELOG_COPY } from '@/frontend/ui/account/changelog-copy';
import { ChangelogView } from '@/frontend/ui/account/changelog-view';

export const metadata: Metadata = {
  title: CHANGELOG_COPY.pageTitle,
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
  return <ChangelogView />;
}
