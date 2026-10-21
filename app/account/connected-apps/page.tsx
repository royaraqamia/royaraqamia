import type { Metadata } from 'next';

import { requireAuth } from '@/backend/middleware/auth-guard';
import { McpConnectedAppsView } from '@/frontend/ui/account/mcp-connected-apps-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'التَّطبيقات المتَّصلة بالـ MCP',
  description:
    'التَّطبيقات الخارجيَّة المتَّصلة بحسابك عبر بروتوكول سياق النَّماذج (MCP)، مع إمكانيَّة فصل أيٍّ منها في أيِّ وقت.',
};

export default async function AccountConnectedAppsPage() {
  await requireAuth('/auth/login?redirect=/account/connected-apps');

  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>التَّطبيقات المتَّصلة بالـ MCP</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <McpConnectedAppsView />
    </div>
  );
}
