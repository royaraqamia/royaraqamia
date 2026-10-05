'use client';

import { useRouter } from 'next/navigation';
import { PostActionsMenu } from './post-actions-menu';
import type { Post } from '@/shared/contracts/blogpress';

/**
 * Detail-page host for the per-post actions. On delete it leaves the (now
 * missing) post and returns to the feed; undo refreshes the cached route.
 */
export function PostOwnerActions({ post }: { post: Post }) {
  const router = useRouter();

  return (
    <PostActionsMenu
      post={post}
      onRemoved={() => router.push('/community')}
      onRestored={() => router.refresh()}
    />
  );
}
