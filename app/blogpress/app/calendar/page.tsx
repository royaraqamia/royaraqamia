import type { Metadata } from 'next';
import Link from 'next/link';
import { verifySession } from '@/backend/middleware/session-guard';
import { loadBlogpressDashboard } from '@/backend/loaders/blogpress';
import { ScheduledCalendar } from '@/frontend/ui/blogpress/scheduled-calendar';
import { CalendarRange, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  description: 'تقويم مقالات BlogPress المجدولة – انشر بجدول زمني في مكانٍ واحد.',
};

export default async function CalendarPage() {
  const session = await verifySession();
  const posts = await loadBlogpressDashboard(session.userId);

  const scheduled = posts.filter((p) => p.status === 'scheduled' && p.publish_at);
  const drafts = posts.filter((p) => p.status === 'draft');

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 text-primary shrink-0">
            <CalendarRange className="size-5" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">التقويم</h1>
            <p className="text-sm text-muted-foreground mt-1">جدولة ونشر المقالات المخططة</p>
          </div>
        </div>
        <Link
          href="/blogpress/app"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ArrowRight className="size-4 -scale-x-100" />
          لوحة المقالات
        </Link>
      </div>

      <ScheduledCalendar scheduled={scheduled} drafts={drafts} withReorder />
    </div>
  );
}
