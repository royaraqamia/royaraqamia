import type { Metadata } from 'next';

import { ACCOUNT_MEMORY_COPY } from '@/frontend/ui/account/memory-copy';
import { MemoryView } from '@/frontend/ui/account/memory-view';

export const metadata: Metadata = {
  title: `${ACCOUNT_MEMORY_COPY.pageTitle} · حسابي`,
  description: ACCOUNT_MEMORY_COPY.intro,
};

/**
 * A data-free shell, like the rest of `/account` (#448): the guard and the read
 * live in `MemoryView` on the client, so a guest is pointed at sign-in and the
 * document stays cacheable.
 *
 * Rendered per request on purpose, though the document is the same for everyone:
 * the precache list is a measured budget (ADR-0071) and the slot belongs to
 * `/verify`, the link printed on physical certificates (see `DYNAMIC_BY_DESIGN`).
 */
export const dynamic = 'force-dynamic';

export default function AccountMemoryPage() {
  return <MemoryView />;
}
