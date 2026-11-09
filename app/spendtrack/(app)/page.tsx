import type { Metadata } from 'next';
import { SpendtrackSurface } from '@/frontend/ui/spendtrack/spendtrack-surface';

export const metadata: Metadata = {
  title: 'تتبُّع المصاريف',
  description:
    'تتبَّع مصاريفك اليوميَّة، حلِّل أنماط إنفاقك، وتحكَّم في ميزانيَّتك مع تتبُّع المصاريف.',
};

/**
 * The dashboard as a cached, data-free shell (#449, ADR-0073).
 *
 * No session read, no `searchParams`, no loader: the document is identical for
 * every account, so the worker can cache and precache it, and `SpendtrackPageClient`
 * paints the Local Store into it. The store is the only render source; the pull
 * is the only source of server data.
 */

export default function DashboardPage() {
  return <SpendtrackSurface />;
}
