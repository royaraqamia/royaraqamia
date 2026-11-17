'use client';

import { useRouter } from 'next/navigation';
import type { Post } from '@/shared/contracts/blogpress';
import { POST_CARD_COPY } from '../../_components/post-card-copy';
import { PostActionBar } from '../../_components/post-action-bar';

/**
 * The post's own action bar (#1573).
 *
 * Under the body, where a reader is when they finish reading: like, the thread's
 * count, and the owner's menu. Share stays in the header with the author, so the
 * two rows never duplicate a control.
 *
 * A delete here is not the card's: the post the reader is on stops existing, so
 * the host leaves for the feed rather than hiding a card that is the page.
 */
export function PostEngagementBar({ post, label }: { post: Post; label: string }) {
  const router = useRouter();

  return (
    <div
      data-visual="community-post-actions"
      className="mt-10 flex items-center justify-between gap-2 py-1"
    >
      <PostActionBar
        post={post}
        label={label}
        editLabel={POST_CARD_COPY.editAction}
        moreLabel={POST_CARD_COPY.moreAction}
        onRemoved={() => router.push('/community')}
        onRestored={() => router.refresh()}
        showShare={false}
        className="w-full"
      />
    </div>
  );
}
