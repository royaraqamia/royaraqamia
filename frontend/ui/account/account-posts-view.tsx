'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, Eye, FileText, PenLine } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/frontend/state/session-provider';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useBlogpressDashboard } from '@/frontend/state/blogpress/use-blogpress-dashboard';
import { GUEST_IDENTITY } from '@/frontend/shared/local-store/identity';
import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { PostList } from '@/app/account/posts/_components/post-list';
import { PostComposerDialog } from '@/app/community/_components/post-composer-dialog';
import { formatCount } from '@/frontend/shared/format';
import type { Post } from '@/shared/contracts/blogpress';

function PostsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="جاري تحميل منشوراتك">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

/**
 * The member's own posts, and the only authoring surface they have now that
 * BlogPress is gone: the analytics, the status filters, the bulk actions, the
 * pin, the duplicates and exports all live here, over the local-first store
 * that keeps a draft written offline.
 */
export function AccountPostsView() {
  return (
    <Suspense fallback={<PostsSkeleton />}>
      <AccountPostsContent />
    </Suspense>
  );
}

function AccountPostsContent() {
  const { user } = useSession();
  const { identity } = useLocalIdentity();
  const { ready, posts, sync, syncNow } = useBlogpressDashboard(identity);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const stats = useMemo(
    () => ({
      total: posts.length,
      published: posts.filter((post) => post.status === 'published').length,
      scheduled: posts.filter((post) => post.status === 'scheduled').length,
      views: posts.reduce((sum, post) => sum + (post.view_count ?? 0), 0),
    }),
    [posts]
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setComposerOpen(true);
  }, []);

  const openEdit = useCallback((post: Post) => {
    setEditing(post);
    setComposerOpen(true);
  }, []);

  const repaint = useCallback(async () => {
    await syncNow();
  }, [syncNow]);

  // The old `/blogpress/editor/:id` link lands here with `?edit=`: open that
  // post's composer once the store has painted it.
  const editId = searchParams.get('edit');
  useEffect(() => {
    if (!ready || !editId || editing) return;
    const post = posts.find((row) => row.id === editId);
    if (post) {
      setEditing(post);
      setComposerOpen(true);
    }
  }, [ready, editId, posts, editing]);

  const initialFilter = searchParams.get('status') === 'scheduled' ? 'scheduled' : 'all';

  const saved = useCallback(
    (slug: string) => {
      setComposerOpen(false);
      void repaint();
      router.push(`/community/${slug}`);
    },
    [repaint, router]
  );

  if (!ready) return <PostsSkeleton />;

  const isGuest = identity === GUEST_IDENTITY;
  const cards = [
    { label: 'إجمالي المنشورات', value: stats.total, icon: FileText, tone: 'text-primary' },
    { label: 'منشورة', value: stats.published, icon: Eye, tone: 'text-success' },
    { label: 'مجدولة', value: stats.scheduled, icon: CalendarClock, tone: 'text-info' },
    { label: 'إجمالي المشاهدات', value: stats.views, icon: BarChart3, tone: 'text-warning' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          كل ما كتبته، في مكان واحد: مسودَّاتك، ما جدولته، وما نشره الآخرون يقرؤونه.
        </p>
        <SyncStatusPill status={sync} />
      </div>

      {isGuest || !user ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-muted-foreground">
            مسودَّاتك محفوظة على هذا الجهاز؛ سجِّل الدُّخول لنشرها ومزامنتها بين أجهزتك.
          </p>
          <SignInCta
            href="/auth/login?redirect=/account/posts"
            className="h-11 min-w-0 sm:min-w-40"
          />
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <Icon className={`size-5 ${card.tone}`} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 font-digits text-2xl font-bold leading-none">
                    {formatCount(card.value)}
                  </p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PostList
        posts={posts}
        onEdit={openEdit}
        onChanged={repaint}
        onCreate={openCreate}
        initialFilter={initialFilter}
      />

      <FabButton label="منشور جديد" onClick={openCreate}>
        <PenLine className="size-6 transition-transform duration-200 ease-out group-hover:-rotate-6 group-hover:scale-110" />
      </FabButton>

      <PostComposerDialog
        key={editing?.id ?? 'new'}
        open={composerOpen}
        onOpenChange={setComposerOpen}
        mode={editing ? 'edit' : 'create'}
        postId={editing?.id}
        slug={editing?.slug}
        initialBody={editing?.content ?? ''}
        coverImage={editing?.cover_image ?? ''}
        metaTitle={editing?.meta_title ?? ''}
        initialStatus={editing?.status ?? 'published'}
        initialPublishAt={editing?.publish_at ?? null}
        onSaved={saved}
        onDraftSaved={() => void repaint()}
      />
    </div>
  );
}
