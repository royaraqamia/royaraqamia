'use client';

import { memo } from 'react';
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
 * One post as a dense list row.
 *
 * The grid gives the controls fixed `auto` tracks and the text one
 * `minmax(0,1fr)` track. A long post can therefore never push the cover or the
 * selection box outside the row: the text track is the only thing that shrinks.
 * Below `sm` the verbs take their own full-width row; from `sm` they are the
 * last track on the same baseline as everything else.
 */
function PostRowView({ post, isSelected, onToggleSelect, onEdit, onChanged }: PostRowProps) {
  const label = postExcerpt(post.content, post.meta_desc ?? '') || 'بدون عنوان';

  return (
    <article
      data-visual="account-posts-row"
      className="group grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 transition-safe hover:border-border hover:shadow-md sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-4 sm:py-3"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        onClick={() => onToggleSelect(post.id)}
        aria-label="تحديد المنشور"
        className="col-start-1 row-start-1 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
        className="col-start-2 row-start-1 relative shrink-0 overflow-hidden rounded-xl ring-1 ring-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="تعديل المنشور"
      >
        {post.cover_image ? (
          <Image
            src={post.cover_image}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="size-10 rounded-xl object-cover sm:size-12"
          />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary/70 sm:size-12">
            <FileText className="size-5" />
          </span>
        )}
      </button>

      <div className="col-start-3 row-start-1 min-w-0 space-y-1">
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
            className="block w-full truncate text-start text-sm font-bold text-foreground hover:text-primary sm:text-base"
          >
            {label}
          </button>
        </div>

        <div
          data-visual="account-posts-row-meta"
          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        >
          <span className="max-w-full truncate font-mono text-[11px]">/{post.slug}</span>
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

      <div
        data-visual="account-posts-row-trailing"
        className="col-span-3 row-start-2 flex shrink-0 items-center justify-center gap-3 border-t border-border/60 pt-2 sm:col-span-1 sm:col-start-4 sm:row-start-1 sm:justify-end sm:border-0 sm:pt-0"
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

/** A row only repaints when its own post or selection changes. */
export const PostRow = memo(PostRowView);
