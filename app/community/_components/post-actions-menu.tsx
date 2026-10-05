'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal, PenLine, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/frontend/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { useSession } from '@/frontend/state/session-provider';
import { deletePost, restorePost } from '@/frontend/api/blogpress';
import { postExcerpt } from '@/shared/reading-time';
import { PostComposerDialog } from './post-composer-dialog';
import type { PostStatus } from '@/shared/contracts/blogpress';

/** Minimal post shape the owner actions need; both `Post` and `PostSummary` satisfy it. */
export interface ActionablePost {
  id: string;
  author_id: string;
  slug: string;
  content: string | null;
  cover_image: string | null;
  meta_title: string | null;
  meta_desc: string | null;
  status: PostStatus;
  published_at: string | null;
  publish_at: string | null;
  view_count: number;
  featured: boolean;
  community_visible: boolean;
  reading_time_minutes: number;
}

interface PostActionsMenuProps {
  post: ActionablePost;
  /** Called after a successful delete so the host can hide the post optimistically. */
  onRemoved: () => void;
  /** Called after a successful undo so the host can bring the post back. */
  onRestored: () => void;
}

function buildSnapshot(post: ActionablePost) {
  return {
    slug: post.slug,
    content: post.content,
    status: post.status,
    cover_image: post.cover_image,
    meta_title: post.meta_title,
    meta_desc: post.meta_desc,
    published_at: post.published_at,
    publish_at: post.publish_at,
    view_count: post.view_count ?? 0,
    featured: post.featured,
    community_visible: post.community_visible,
    reading_time_minutes: post.reading_time_minutes ?? 0,
  };
}

/**
 * Facebook/X-style per-post actions ("تعديل" / "حذف") shown only to the author.
 * Deletes optimistically and offers a "تراجع" undo that restores the snapshot.
 */
export function PostActionsMenu({ post, onRemoved, onRestored }: PostActionsMenuProps) {
  const { user } = useSession();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user || user.id !== post.author_id) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePost(post.id);
      setConfirmOpen(false);
      onRemoved();
      router.refresh();
      toast.success('تمَّ حذف المنشور', {
        action: {
          label: 'تراجع',
          onClick: async () => {
            try {
              await restorePost(buildSnapshot(post));
              onRestored();
              router.refresh();
              toast.success('تمَّ استرجاع المنشور');
            } catch {
              toast.error('فشل استرجاع المنشور');
            }
          },
        },
      });
    } catch {
      toast.error('فشل حذف المنشور');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="إجراءات المنشور"
            className="size-9 rounded-full border border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-primary/20 hover:text-primary transition-safe"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PenLine className="size-4" />
            <span>تعديل</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            <span>حذف</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PostComposerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        postId={post.id}
        slug={post.slug}
        initialBody={post.content ?? ''}
        coverImage={post.cover_image ?? ''}
        metaTitle={post.meta_title ?? ''}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="حذف المنشور"
        message={`هل أنت متأكد من حذف «${postExcerpt(post.content, post.meta_desc ?? '') || 'بدون عنوان'}»؟ لا يمكن التراجع بعد انتهاء المهلة.`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash2}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
