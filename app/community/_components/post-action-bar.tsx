'use client';

import { Heart, MessageCircle } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { SocialShare } from './social-share';
import { PostActionsMenu } from './post-actions-menu';

/**
 * The two actions the product intends and has no table for yet.
 *
 * They are stated here rather than in `shared/copy/` for the same reason the
 * follow badge's words are: this module is the site's, and the app draws no
 * action bar yet. The day it does, they move to `shared/copy/post-card.json` the
 * way the button's strings already moved (ADR-0098).
 */
const INERT_ACTION_COPY = {
  like: 'إعجاب',
  comment: 'تعليق',
} as const;

interface PostActionBarProps {
  post: PostSummary;
  /** The card is one link; this keeps every control above its overlay. */
  label: string;
  /** The edit item's word, handed down from the card's own copy source. */
  editLabel?: string;
  onRemoved: () => void;
  onRestored: () => void;
  className?: string;
}

/**
 * What you can do about a post, on one row, at the bottom of the card.
 *
 * The bar holds only what can be pressed, and the facts about a post — its views
 * and its age — stay on the meta line above it. That split is why the row does
 * not have to be redesigned when a fourth action arrives: the actions share the
 * row, the facts never do.
 *
 * Like and comment are drawn from day one and inert: the header already reserves
 * their cells, so the row will not re-centre the day the counts exist, and the
 * two cells say so to a screen reader instead of pretending to work. When their
 * tables land, they keep their place and lose `aria-disabled`.
 *
 * The card is one big link with an `inset-0` overlay, so every control here is
 * `relative z-20` — the same rule the old footer followed.
 */
export function PostActionBar({
  post,
  label,
  editLabel,
  onRemoved,
  onRestored,
  className,
}: PostActionBarProps) {
  return (
    <div
      data-visual="community-card-actions"
      className={cn(
        'mt-2 flex items-center justify-between border-t border-border/60 pt-1.5',
        className
      )}
    >
      <div className="flex items-center">
        <InertAction icon={Heart} name={INERT_ACTION_COPY.like} />
        <InertAction icon={MessageCircle} name={INERT_ACTION_COPY.comment} />
      </div>

      <div className="relative z-20 flex items-center">
        <SocialShare url={`/community/${post.slug}`} title={label} />
        <PostActionsMenu
          post={post}
          editLabel={editLabel}
          onRemoved={onRemoved}
          onRestored={onRestored}
        />
      </div>
    </div>
  );
}

/**
 * A cell whose action does not exist yet: same size, same place, no hover and no
 * press. `aria-disabled` rather than `disabled`, so it stays focusable and can
 * say why it does nothing.
 */
function InertAction({ icon: Icon, name }: { icon: typeof Heart; name: string }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={`${name} — قريبًا`}
      title={`${name} — قريبًا`}
      className="relative z-20 inline-flex h-11 min-w-11 cursor-default items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-muted-foreground/45"
    >
      <Icon className="size-[17px]" aria-hidden="true" />
      <span className="font-digits" dir="ltr" aria-hidden="true">
        0
      </span>
    </button>
  );
}
