'use client';

import Image from 'next/image';
import { Check, Clock, Eye, FileText, Pin } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { formatHijriDate } from '@/frontend/shared/format';
import { postExcerpt } from '@/shared/reading-time';
import { PostRowMenu } from './post-row-menu';
import type { Post, PostStatus } from '@/shared/contracts/blogpress';

interface PostRowProps {
  post: Post;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (post: Post) => void;
  /** Repaints the store after a server-owned transition. */
  onChanged: () => Promise<void> | void;
}

function statusLabel(status: PostStatus): string {
  return status === 'published' ? 'منشورة' : status === 'scheduled' ? 'مجدولة' : 'مسودَّة';
}

/**
 * One post as the list draws it: the selection box, the cover, what the post is
 * and when it last moved, then the status and the verbs. The verbs are
 * `PostRowMenu`'s, so a row that draws the wrong thing cannot also send a bulk
 * delete.
 */
export function PostRow({ post, isSelected, onToggleSelect, onEdit, onChanged }: PostRowProps) {
  const label = postExcerpt(post.content, post.meta_desc ?? '') || 'بدون عنوان';

  return (
    <article
      data-visual="account-posts-row"
      className="group flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-3.5 transition-safe hover:border-border hover:shadow-md sm:flex-row sm:items-center sm:p-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:items-center">
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          onClick={() => onToggleSelect(post.id)}
          aria-label="تحديد المنشور"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-md border',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/50'
            )}
          >
            {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onEdit(post)}
          className="relative shrink-0 overflow-hidden rounded-xl ring-1 ring-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="تعديل المنشور"
        >
          {post.cover_image ? (
            <Image
              src={post.cover_image}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="size-12 rounded-xl object-cover sm:size-14"
            />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary/70 sm:size-14">
              <FileText className="size-5" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            {post.featured ? (
              <span
                className="inline-flex shrink-0 items-center rounded-md bg-amber-500/10 p-1 text-amber-600 ring-1 ring-amber-500/20"
                title="مثبَّت"
              >
                <Pin className="size-3" aria-label="مثبَّت" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onEdit(post)}
              data-visual="account-posts-row-title"
              className="block truncate text-start text-sm font-bold text-foreground hover:text-primary sm:text-base"
            >
              {label}
            </button>
          </div>

          <div
            data-visual="account-posts-row-meta"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          >
            <span className="truncate font-mono text-[11px]">/{post.slug}</span>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {(post.view_count ?? 0).toLocaleString('ar-u-nu-latn')}
            </span>
            {post.published_at ? (
              <>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatHijriDate(post.published_at)}
                </span>
              </>
            ) : post.publish_at ? (
              <>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatHijriDate(post.publish_at, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">•</span>
                <span>آخر تعديل {formatHijriDate(post.updated_at)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        data-visual="account-posts-row-trailing"
        className="flex shrink-0 items-center justify-end gap-3 border-t border-border/60 pt-2 sm:border-0 sm:pt-0"
      >
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
            post.status === 'published'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
              : post.status === 'scheduled'
                ? 'border-sky-500/20 bg-sky-500/10 text-sky-600'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
          )}
        >
          {statusLabel(post.status)}
        </span>

        <PostRowMenu post={post} title={label} onEdit={onEdit} onChanged={onChanged} />
      </div>
    </article>
  );
}
