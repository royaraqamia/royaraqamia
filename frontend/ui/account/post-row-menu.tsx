'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CopyPlus,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileCodeCorner,
  FileDown,
  LoaderCircle,
  PenLine,
  Pin,
  PinOff,
  Trash,
} from 'lucide-react';
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
import {
  deletePost,
  duplicatePost,
  publishPost,
  restorePost,
  setPostFeatured,
  unpublishPost,
} from '@/frontend/api/blogpress';
import { downloadPostAsFile } from '@/frontend/shared/blogpress/export-post';
import type { Post } from '@/shared/contracts/blogpress';

interface PostRowMenuProps {
  post: Post;
  /** The owner's word for the post: the exports name their file with it. */
  title: string;
  onEdit: (post: Post) => void;
  /** Repaints the store after a server-owned transition. */
  onChanged: () => Promise<void> | void;
}

/**
 * A row's seven verbs, and the delete that owns its own confirmation and its
 * undo. The trigger is the row's last control, so the row draws no part of it:
 * the busy state of a transition belongs to the menu that started it.
 */
export function PostRowMenu({ post, title, onEdit, onChanged }: PostRowMenuProps) {
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const act = async (run: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await run();
      await onChanged();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setDeleteOpen(false);
    setBusy(true);
    void deletePost(post.id)
      .then(({ updatedAt }) => {
        toast.success('تمَّ حذف المنشور', {
          action: {
            label: 'تراجع',
            onClick: () => {
              // The undo carries the tombstone's stamp, never the body the row
              // was painted from (#1518): the server keeps whatever it holds,
              // and refuses the undo outright when that is no longer this
              // member's delete.
              void restorePost({ id: post.id, ...(updatedAt ? { updatedAt } : {}) })
                .then(() => onChanged())
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : 'فشل استرجاع المنشور')
                );
            },
          },
        });
      })
      .catch(() => toast.error('فشل حذف المنشور'))
      .finally(() => {
        setBusy(false);
        void onChanged();
      });
  };

  const exportAs = (format: 'markdown' | 'html', done: string) => {
    void downloadPostAsFile(title, post.content ?? '', format)
      .then(() => toast.success(done))
      .catch(() => toast.error('فشل تصدير المنشور'));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="إجراءات المنشور" disabled={busy}>
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Ellipsis className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => onEdit(post)}>
            <PenLine className="me-2 size-4" />
            تعديل
          </DropdownMenuItem>
          {post.status === 'published' ? (
            <DropdownMenuItem asChild>
              <Link href={`/community/${post.slug}`} target="_blank">
                <ExternalLink className="me-2 size-4" />
                عرض المنشور
              </Link>
            </DropdownMenuItem>
          ) : null}
          {post.status === 'published' ? (
            <DropdownMenuItem
              onSelect={() => void act(() => unpublishPost(post.id), 'فشل إلغاء نشر المنشور')}
            >
              <EyeOff className="me-2 size-4" />
              إلغاء النَّشر
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => void act(() => publishPost(post.id), 'فشل نشر المنشور')}
            >
              <Eye className="me-2 size-4" />
              {post.status === 'scheduled' ? 'نشر الآن' : 'نشر'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() =>
              void act(() => setPostFeatured(post.id, !post.featured), 'فشل تحديث التَّثبيت')
            }
          >
            {post.featured ? <PinOff className="me-2 size-4" /> : <Pin className="me-2 size-4" />}
            {post.featured ? 'إلغاء التَّثبيت' : 'تثبيت'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void act(() => duplicatePost(post.id), 'فشل نسخ المنشور')}
          >
            <CopyPlus className="me-2 size-4" />
            نسخ المنشور
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => exportAs('markdown', 'تمَّ تصدير المنشور بصيغة Markdown')}
          >
            <FileDown className="me-2 size-4" />
            تصدير Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportAs('html', 'تمَّ تصدير المنشور بصيغة HTML')}>
            <FileCodeCorner className="me-2 size-4" />
            تصدير HTML
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash className="me-2 size-4" />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        title="حذف المنشور"
        message={`هل تريد حذف «${title}»؟`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash}
        variant="danger"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </>
  );
}
