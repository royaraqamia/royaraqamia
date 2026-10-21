import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarRange, ArrowRight } from 'lucide-react';
import { BlogpressCalendar } from '@/frontend/ui/blogpress/blogpress-calendar';

export const metadata: Metadata = {
  description: 'تقويم منشورات BlogPress المجدولة – انشر بجدول زمني في مكانٍ واحد.',
};

/**
 * A cached, data-free shell (#449, ADR-0073). The session read and the post
 * query moved into `BlogpressCalendar`, which paints the Local Store; the page
 * keeps only the chrome both online and offline share.
 */
export default function CalendarPage() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 text-primary shrink-0">
            <CalendarRange className="size-5" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">التقويم</h1>
            <p className="text-sm text-muted-foreground mt-1">جدولة ونشر المنشورات المخططة</p>
          </div>
        </div>
        <Link
          href="/blogpress"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ArrowRight className="size-4 -scale-x-100" />
          لوحة المنشورات
        </Link>
      </div>

      <BlogpressCalendar />
    </div>
  );
}
