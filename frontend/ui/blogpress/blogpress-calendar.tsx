'use client';

import { useSession } from '@/frontend/state/session-provider';
import { useBlogpressDashboard } from '@/frontend/state/blogpress/use-blogpress-dashboard';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { ScheduledCalendar } from '@/frontend/ui/blogpress/scheduled-calendar';

/**
 * The calendar as a cached shell (#449, ADR-0073): the page around it is static
 * and this paints the Local Store's scheduled and draft posts, so an offline
 * reload renders the calendar instead of the offline page. Scheduling a post
 * still needs the server, which `ScheduledCalendar` already says inline.
 */
export function BlogpressCalendar() {
  const { user, isLoading } = useSession();
  const { posts } = useBlogpressDashboard(user?.id ?? null);

  if (isLoading) {
    return (
      <div
        className="h-96 animate-pulse rounded-3xl border border-neutral-200/60 bg-neutral-100/60 dark:border-neutral-800/60 dark:bg-neutral-900/40"
        aria-busy="true"
        aria-label="جاري فتح التَّخزين المحلِّي"
      />
    );
  }

  if (!user) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-neutral-200 bg-neutral-50/60 p-10 text-center dark:border-neutral-800 dark:bg-neutral-900/30">
        <p className="max-w-md text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          سجِّل الدُّخول لعرض تقويم منشوراتك المجدولة.
        </p>
        <SignInCta href="/auth/login?redirect=/blogpress/calendar" className="mt-1" />
      </section>
    );
  }

  const scheduled = posts.filter((post) => post.status === 'scheduled' && post.publish_at);
  const drafts = posts.filter((post) => post.status === 'draft');

  return <ScheduledCalendar scheduled={scheduled} drafts={drafts} withReorder />;
}
