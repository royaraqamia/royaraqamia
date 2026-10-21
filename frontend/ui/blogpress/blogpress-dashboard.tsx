'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BarChart3, CalendarClock, CalendarRange, Eye, FileText } from 'lucide-react';
import { useSession } from '@/frontend/state/session-provider';
import { useBlogpressDashboard } from '@/frontend/state/blogpress/use-blogpress-dashboard';
import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { PostList } from '@/app/blogpress/_components/post-list';
import { CreatePostButton } from '@/app/blogpress/_components/create-post-button';
import { AutoCreatePost } from '@/app/blogpress/_components/auto-create-post';

/**
 * BlogPress's dashboard as a cached shell (#449, ADR-0073).
 *
 * The root used to be a `force-dynamic` RSC page behind a `requireAuth` layout:
 * the guard and the post list were server renders, so the document could never
 * be cached and an offline reload landed on `/offline`. The layout is now open
 * (its editor keeps its own server guard) and this component resolves the
 * session, paints the Local Store's drafts, and shows the same sign-in prompt a
 * guest gets from `/account`. Categories and tags are still server reads, so
 * offline the filter row and tag chips are absent rather than wrong.
 */

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جاري فتح التَّخزين المحلِّي">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-neutral-200/60 dark:bg-neutral-800/60" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-24 animate-pulse rounded-xl border border-neutral-200/60 bg-neutral-100/60 dark:border-neutral-800/60 dark:bg-neutral-900/40"
          />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-2xl bg-neutral-200/60 dark:bg-neutral-800/60" />
      <div className="h-96 animate-pulse rounded-2xl bg-neutral-200/60 dark:bg-neutral-800/60" />
    </div>
  );
}

export function BlogpressDashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <BlogpressDashboardContent />
    </Suspense>
  );
}

function BlogpressDashboardContent() {
  const searchParams = useSearchParams();
  const { user, isLoading } = useSession();
  const { ready, posts, sync } = useBlogpressDashboard(user?.id ?? null);

  if (isLoading) return <DashboardSkeleton />;

  if (!user) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-neutral-200 bg-neutral-50/60 p-10 text-center dark:border-neutral-800 dark:bg-neutral-900/30">
        <FileText className="size-10 text-neutral-400" aria-hidden="true" />
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            سجِّل الدُّخول لعرض منشوراتك
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            لوحة BlogPress تعرض مسودَّاتك ومنشوراتك، وهي محفوظة على هذا الجهاز بعد أوَّل زيارة.
          </p>
        </div>
        <SignInCta href="/auth/login?redirect=/blogpress" className="mt-1" />
      </section>
    );
  }

  if (!ready) return <DashboardSkeleton />;

  const stats = {
    total: posts.length,
    published: posts.filter((post) => post.status === 'published').length,
    scheduled: posts.filter((post) => post.status === 'scheduled').length,
    views: posts.reduce((sum, post) => sum + (post.view_count ?? 0), 0),
  };

  const statCards = [
    {
      label: 'إجمالي المنشورات',
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
      {searchParams.get('create') === '1' && <AutoCreatePost />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-2">
          <Link
            href="/blogpress/calendar"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <CalendarRange className="size-4" />
            التقويم
          </Link>
          <CreatePostButton />
        </div>
        <SyncStatusPill status={sync} />
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

      {/* Categories and tags are server-owned reads; offline they are absent,
          so the list renders without its filter row rather than with a wrong
          one (ADR-0073). */}
      <PostList posts={posts} categories={[]} tagsByPost={{}} />
    </div>
  );
}
