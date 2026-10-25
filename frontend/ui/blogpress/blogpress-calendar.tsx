'use client';

import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useBlogpressDashboard } from '@/frontend/state/blogpress/use-blogpress-dashboard';
import { ScheduledCalendar } from '@/frontend/ui/blogpress/scheduled-calendar';

/**
 * The calendar as a cached shell (#449, ADR-0073): the page around it is static
 * and this paints the identity's Local Store's scheduled and draft posts, so an
 * offline reload renders the calendar instead of the offline page. Scheduling a
 * post still needs the server, which `ScheduledCalendar` already says inline.
 *
 * A guest's own drafts are worth showing here too — the calendar is the same
 * store, read a different way (#493) — so there is no session gate.
 */
export function BlogpressCalendar() {
  const { identity } = useLocalIdentity();
  const { posts } = useBlogpressDashboard(identity);

  const scheduled = posts.filter((post) => post.status === 'scheduled' && post.publish_at);
  const drafts = posts.filter((post) => post.status === 'draft');

  return <ScheduledCalendar scheduled={scheduled} drafts={drafts} withReorder />;
}
