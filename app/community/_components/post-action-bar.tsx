'use client';

import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import {
  useLikePost,
  usePostEngagement,
} from '@/frontend/state/community/post-engagement-provider';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { POST_CARD_COPY } from './post-card-copy';
import { SocialShare } from './social-share';
import { PostActionsMenu } from './post-actions-menu';
import { ACTION_CELL_CLASS, PostActionCount } from './post-action-cell';

interface PostActionBarProps {
  post: PostSummary;
  /** The card is one link; this keeps every control above its overlay. */
  label: string;
  /** The edit item's word, handed down from the card's own copy source. */
  editLabel?: string;
  /** The menu trigger's accessible name, from the card's copy source. */
  moreLabel?: string;
  onRemoved: () => void;
  onRestored: () => void;
  className?: string;
  /**
   * The post page draws share beside the author, so its bottom bar omits it.
   * The card has one row and keeps it.
   */
  showShare?: boolean;
}

/**
 * What you can do about a post, on one row, at the bottom of the card or under
 * the post itself (#1573).
 *
 * The bar holds only what can be pressed, and the facts about a post — its views
 * and its age — stay on the meta line. That split is why the row does not have
 * to be redesigned when a fourth action arrives.
 *
 * Like and comment are real since #1573: the like is optimistic and settles on
 * the count the server answers, and the comment cell is the thread's front door
 * on the post page. The cell shapes are identical, so the row reads as one bar
 * rather than as two kinds of control; a live action is told apart by its
 * behaviour (hover, press, colour), never by being rounder than its neighbour.
 */
export function PostActionBar({
  post,
  label,
  editLabel,
  moreLabel,
  onRemoved,
  onRestored,
  className,
  showShare = true,
}: PostActionBarProps) {
  const { user } = useSession();
  const engagement = usePostEngagement(post.id);
  const like = useLikePost();
  const { requireSignIn, dialog } = useSignInPrompt();

  const liked = engagement?.liked ?? false;

  const handleLike = () => {
    if (!user) {
      requireSignIn(`/community/${post.slug}`);
      return;
    }
    void like(post.id, post.slug, !liked);
  };

  return (
    <div
      data-visual="community-card-actions"
      className={cn('flex items-center justify-between gap-2', className)}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={handleLike}
          aria-pressed={liked}
          aria-label={liked ? POST_CARD_COPY.unlikeAction : POST_CARD_COPY.likeAction}
          title={liked ? POST_CARD_COPY.unlikeAction : POST_CARD_COPY.likeAction}
          className={cn(ACTION_CELL_CLASS, liked && 'text-primary hover:text-primary')}
        >
          <Heart className={cn('size-[18px]', liked && 'fill-current')} aria-hidden="true" />
          <PostActionCount value={engagement?.likeCount} />
        </button>

        <Link
          href={`/community/${post.slug}#comments`}
          aria-label={POST_CARD_COPY.commentAction}
          title={POST_CARD_COPY.commentAction}
          className={ACTION_CELL_CLASS}
        >
          <MessageCircle className="size-[18px]" aria-hidden="true" />
          <PostActionCount value={engagement?.commentCount} />
        </Link>
      </div>

      <div className="flex items-center gap-0.5">
        {showShare && (
          <SocialShare
            url={`/community/${post.slug}`}
            title={label}
            label={POST_CARD_COPY.shareAction}
            className={ACTION_CELL_CLASS}
          />
        )}
        <PostActionsMenu
          post={post}
          editLabel={editLabel}
          moreLabel={moreLabel}
          onRemoved={onRemoved}
          onRestored={onRestored}
        />
      </div>

      {dialog}
    </div>
  );
}
