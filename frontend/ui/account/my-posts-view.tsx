'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';

import { getMyPosts } from '@/frontend/api/me';
import { useSession } from '@/frontend/state/session-provider';
import { ApiError } from '@/frontend/transport/http';
import { PostCard } from '@/app/community/_components/post-card';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import type { PostSummary } from '@/shared/contracts/blogpress';

function PostsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="جاري تحميل منشوراتك">
      {[0, 1].map((key) => (
        <div key={key} className="rounded-2xl border border-border/60 bg-card p-5">
          <Skeleton className="mb-3 h-5 w-48" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * The signed-in member's own published posts on the community feed. The list
 * moved off the server render (#448): the document is a data-free shell the
 * worker may cache, and this view reads the feed through the never-cache
 * `/api/me` seam, so a cached document or payload never carries one member's
 * posts for the next.
 *
 * The three answers a failed read can get are kept apart: a guest is pointed at
 * sign-in, an unreachable server renders the shared needs-connection state with
 * its retry, and a genuinely empty feed renders the empty state — the last two
 * are different statements, not two spellings of «». Note the `nextCursor` of
 * the feed result is not used here yet: the page shows the first page, exactly
 * as the server render it replaced did.
 */
export function MyPostsView() {
  const { user, isLoading } = useSession();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadOffline, setLoadOffline] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setLoadOffline(false);
    try {
      setPosts((await getMyPosts()).posts);
    } catch (error) {
      setPosts(null);
      setLoadOffline(error instanceof ApiError && error.isNetworkError);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;
    void load();
  }, [isLoading, user, load]);

  if (isLoading) return <PostsSkeleton />;

  if (!user) return <SignInCta href="/auth/login?redirect=/account/posts" />;

  if (loadFailed) {
    if (loadOffline) {
      return (
        <NeedsConnection
          message="تعذّر تحميل منشوراتك: لم يصل الطَّلب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
          onRetry={() => void load()}
        />
      );
    }

    return (
      <EmptyState
        icon={FileText}
        variant="card"
        title="تعذَّر تحميل المنشورات"
        description="حدث خطأ أثناء قراءة منشوراتك من الخادم."
      />
    );
  }

  if (posts === null) return <PostsSkeleton />;

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        variant="card"
        title="لا توجد منشورات بعد"
        description="لم تنشر أيَّ منشور على المجتمع حتَّى الآن."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} index={index} />
      ))}
    </div>
  );
}
