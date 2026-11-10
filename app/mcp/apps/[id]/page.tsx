import '../../app.css';
import type { Metadata } from 'next';

import { McpConnectionView } from '@/frontend/ui/mcp/connection-view';

export const metadata: Metadata = {
  title: 'تطبيق مرتبط',
  description: 'أدوات التطبيق الذي يستطيع نور استدعاءها، وصلاحيتها، ومفاتيح كل أداة على حدة.',
};

interface ConnectionSearchParams {
  connect?: string;
}

/**
 * The post-connect screen (ADR-0155, phase 3 / #1224).
 *
 * `/mcp/callback` lands the member here with `?connect=done`, and the same
 * screen is the one an `إدارة` row opens: the connection's tools, which of them
 * write, each switch, the permission level, and «افصل».
 */
export default async function McpConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ConnectionSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  return (
    <div className="relative flex min-h-[var(--roy-page-height)] flex-col bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <main id="main-content" dir="rtl" className="flex-1 pt-6 pb-28 md:pb-32">
        <div className="cv-auto mx-auto max-w-3xl px-4">
          <McpConnectionView connectionId={id} connected={query.connect === 'done'} />
        </div>
      </main>
    </div>
  );
}
