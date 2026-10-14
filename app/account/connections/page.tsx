import type { Metadata } from 'next';

import { requireAuth } from '@/backend/middleware/auth-guard';
import { McpConnectionsView } from '@/frontend/ui/account/mcp-connections-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'التَّطبيقات المتَّصلة',
  description:
    'التَّطبيقات الخارجيَّة المتَّصلة بحسابك عبر بروتوكول سياق النَّماذج (MCP)، مع إمكانيَّة فصل أيٍّ منها في أيِّ وقت.',
};

export default async function AccountConnectionsPage() {
  await requireAuth('/auth/login?redirect=/account/connections');

  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>التَّطبيقات المتَّصلة</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <McpConnectionsView />
    </div>
  );
}
