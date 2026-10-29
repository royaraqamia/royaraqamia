import type { Metadata } from 'next';

import { NotesPageClient } from '@/frontend/ui/notes/notes-page-client';

export const metadata: Metadata = {
  title: 'المُلاحظات',
  description:
    'دفتر ملاحظات سريع يعمل بلا اتِّصال: اكتب ونظِّم وابحث، ويُزامَن تلقائيًّا مع حسابك.',
};

/**
 * The page is a cached, data-free shell (#449, ADR-0073): no session read, no
 * server `searchParams`, no loader. `NotesPageClient` opens the Local Store and
 * paints it, so the document is identical for a guest and an account and the
 * worker can precache it (ADR-0092).
 */
export default function NotesPage() {
  return (
    <div className="space-y-6 pb-8">
      <NotesPageClient />
    </div>
  );
}
