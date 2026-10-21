import type { Metadata } from 'next';

import { McpConnectedAppsView } from '@/frontend/ui/account/mcp-connected-apps-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'التَّطبيقات المتَّصلة',
  description:
    'التَّطبيقات الخارجيَّة المتَّصلة بحسابك عبر بروتوكول سياق النَّماذج (MCP)، مع إمكانيَّة فصل أيٍّ منها في أيِّ وقت.',
};

/**
 * A data-free shell: the guard and the read live in `McpConnectedAppsView` on
 * the client (#448), so the document carries nothing account-bearing and the
 * worker may cache it. The read runs on the never-cache `/api/me` prefix, so
 * offline it answers with the view's own needs-connection state.
 */
export default function AccountConnectedAppsPage() {
  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>التَّطبيقات المتَّصلة</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <McpConnectedAppsView />
    </div>
  );
}
