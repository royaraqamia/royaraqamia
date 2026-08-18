import type { Metadata } from 'next';
import { verifySession } from '@/backend/middleware/session-guard';
import {
  loadBlogpressDashboard,
  loadBlogCategories,
  loadManyPostTags,
} from '@/backend/loaders/blogpress';
import { PostList } from '../_components/post-list';
import { CreatePostButton } from '../_components/create-post-button';
import { AutoCreatePost } from '../_components/auto-create-post';
import { FileText, Eye, CalendarClock, BarChart3, CalendarRange } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  description: 'لوحة تحكُّم BlogPress – إدارة المقالات وإنشاء محتوى جديد.',
};

interface DashboardSearchParams {
  category?: string;
  create?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { category, create } = await searchParams;
  const session = await verifySession();
  const [postList, categories] = await Promise.all([
    loadBlogpressDashboard(session.userId, category),
    loadBlogCategories(session.userId),
  ]);
  const tagsByPost = await loadManyPostTags(postList.map((p) => p.id));

  const stats = {
    total: postList.length,
    published: postList.filter((p) => p.status === 'published').length,
    scheduled: postList.filter((p) => p.status === 'scheduled').length,
    views: postList.reduce((sum, p) => sum + (p.view_count ?? 0), 0),
  };

  const statCards = [
    {
      label: 'إجمالي المقالات',
      value: stats.total,
      icon: FileText,
      bg: 'bg-primary/10',
      tx: 'text-primary',
    },
    { label: 'منشورة', value: stats.published, icon: Eye, bg: 'bg-success/10', tx: 'text-success' },
    {
      label: 'مجدولة',
      value: stats.scheduled,
      icon: CalendarClock,
      bg: 'bg-info/10',
      tx: 'text-info',
    },
    {
      label: 'إجمالي المشاهدات',
      value: stats.views.toLocaleString('ar-u-nu-latn'),
      icon: BarChart3,
      bg: 'bg-warning/10',
      tx: 'text-warning',
    },
  ] as const;

  return (
    <div>
      {create === '1' && <AutoCreatePost />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">إدارة المقالات</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/blogpress/app/calendar"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <CalendarRange className="size-4" />
            التقويم
          </Link>
          <CreatePostButton />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border/50 bg-card p-4 card-lift"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`size-10 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`size-5 ${stat.tx}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-none mb-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PostList
        posts={postList}
        categories={categories}
        activeCategory={category}
        tagsByPost={tagsByPost}
      />
    </div>
  );
}
