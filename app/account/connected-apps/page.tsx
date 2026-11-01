import type { Metadata } from 'next';

import { McpConnectedAppsView } from '@/frontend/ui/account/mcp-connected-apps-view';

export const metadata: Metadata = {
  title: 'التَّطبيقات المتَّصلة بالـ MCP',
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
  return <McpConnectedAppsView />;
}
