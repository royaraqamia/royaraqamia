'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ellipsis, Eye, EyeOff, FileText, Flag, Loader2, PenLine, Trash2 } from 'lucide-react';
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
import {
  deletePost,
  publishPost,
  restorePost,
  setPostFeatured,
  unpublishPost,
} from '@/frontend/api/blogpress';
import { downloadPostAsFile } from '@/frontend/shared/blogpress/export-post';
import { postExcerpt } from '@/shared/reading-time';
import { PostComposerDialog } from '@/frontend/ui/community/post-composer-dialog';
import { POST_CARD_COPY } from './post-card-copy';
import { actionCellClass } from './post-action-cell';
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
  /** The edit item's word. The feed card passes it from the shared copy source. */
  editLabel?: string;
  /** The trigger's accessible name. The card owns it, so the parity row reads it. */
  moreLabel?: string;
  /** Called after a successful delete so the host can hide the post optimistically. */
  onRemoved: () => void;
  /** Called after a successful undo so the host can bring the post back. */
  onRestored: () => void;
}

function buildRestore(post: ActionablePost, updatedAt: string | null) {
  // Only the handle and the stamp the delete answered with (#1518). The row the
  // delete tombstoned still holds its body, so the undo has no copy to resend.
  return { id: post.id, ...(updatedAt ? { updatedAt } : {}) };
}

/**
 * The owner's actions on a post, on the feed card and on the post page alike.
 * Every item is written here by hand: this is not the account page's old row
 * menu, which carried actions that belonged to a management list rather than to
 * the post itself. The delete owns its confirmation and its undo; the other
 * transitions repaint through `router.refresh()`.
 */
export function PostActionsMenu({
  post,
  editLabel = POST_CARD_COPY.editAction,
  moreLabel = POST_CARD_COPY.moreAction,
  onRemoved,
  onRestored,
}: PostActionsMenuProps) {
  const { user } = useSession();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user || user.id !== post.author_id) return null;

  const title = post.meta_title || postExcerpt(post.content, 'post') || 'post';

  const act = async (run: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await run();
      router.refresh();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = () => {
    void downloadPostAsFile(title, post.content ?? '')
      .then(() => toast.success('تمَّ تصدير المنشور بصيغة Markdown'))
      .catch(() => toast.error('فشل تصدير المنشور'));
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { updatedAt } = await deletePost(post.id);
      setConfirmOpen(false);
      onRemoved();
      router.refresh();
      toast.success(POST_CARD_COPY.deleted, {
        action: {
          label: POST_CARD_COPY.undo,
          onClick: async () => {
            try {
              await restorePost(buildRestore(post, updatedAt));
              onRestored();
              router.refresh();
              toast.success(POST_CARD_COPY.restored);
            } catch (error) {
              // The server's refusal says why ("تغيَّر المنشور…"), and that is
              // the sentence the member can act on (#1518).
              toast.error(error instanceof Error ? error.message : 'فشل استرجاع المنشور');
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
            aria-label={moreLabel}
            title={moreLabel}
            disabled={busy}
            className={actionCellClass('size-10 min-w-10 px-0')}
          >
            {busy ? (
              <Loader2 className="size-[18px] animate-spin" />
            ) : (
              <Ellipsis className="size-[18px]" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PenLine className="size-4" />
            <span>{editLabel}</span>
          </DropdownMenuItem>
          {post.status === 'published' ? (
            <DropdownMenuItem
              onClick={() => void act(() => unpublishPost(post.id), 'فشل إلغاء نشر المنشور')}
              disabled={busy}
            >
              <EyeOff className="size-4" />
              <span>{POST_CARD_COPY.unpublishAction}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => void act(() => publishPost(post.id), 'فشل نشر المنشور')}
              disabled={busy}
            >
              <Eye className="size-4" />
              <span>
                {post.status === 'scheduled'
                  ? POST_CARD_COPY.publishNowAction
                  : POST_CARD_COPY.publishAction}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              void act(() => setPostFeatured(post.id, !post.featured), 'فشل تحديث التثبيت')
            }
            disabled={busy}
          >
            <Flag className="size-4" />
            <span>{post.featured ? POST_CARD_COPY.unpinAction : POST_CARD_COPY.pinAction}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportMarkdown}>
            <FileText className="size-4" />
            <span>{POST_CARD_COPY.exportMarkdownAction}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="size-4" />
            <span>{POST_CARD_COPY.deleteAction}</span>
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
        title={POST_CARD_COPY.deleteTitle}
        message={POST_CARD_COPY.deleteMessage.replace(
          '{title}',
          postExcerpt(post.content, post.meta_desc ?? '') || 'بدون عنوان'
        )}
        confirmLabel={POST_CARD_COPY.deleteAction}
        cancelLabel="إلغاء"
        icon={Trash2}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
