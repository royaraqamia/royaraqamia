import type { Metadata } from 'next';
import { BlogpressDashboard } from '@/frontend/ui/blogpress/blogpress-dashboard';

export const metadata: Metadata = {
  description: 'لوحة تحكُّم BlogPress – إدارة المنشورات وإنشاء محتوى جديد.',
};

/**
 * A cached, data-free shell (#449, ADR-0073). The session guard, the post list
 * and the stats were server renders; they now come from the Local Store in
 * `BlogpressDashboard`, so the document is identical for every account and can
 * be cached and precached.
 */
export default function DashboardPage() {
  return <BlogpressDashboard />;
}
