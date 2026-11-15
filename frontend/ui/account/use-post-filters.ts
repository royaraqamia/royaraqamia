'use client';

import { useMemo, useState } from 'react';

import type { Post, PostStatus } from '@/shared/contracts/blogpress';

export type PostFilter = PostStatus | 'all';

/** The one panel the filter chips control; the chips name it, the panel names them back. */
export const POSTS_PANEL_ID = 'account-posts-panel';

export const POST_FILTERS: { label: string; value: PostFilter }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'مسودَّات', value: 'draft' },
  { label: 'مجدولة', value: 'scheduled' },
  { label: 'منشورة', value: 'published' },
];

/** Pinned first, then the store's newest-updated order. */
export function ordered(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => Number(b.featured) - Number(a.featured));
}

/** The rows the panel draws: the status, then the search, in the store's order. */
export function filterPosts(posts: Post[], status: PostFilter, query: string): Post[] {
  let rows = status === 'all' ? posts : posts.filter((post) => post.status === status);
  const term = query.trim().toLowerCase();
  if (term) {
    rows = rows.filter(
      (post) =>
        (post.content ?? '').toLowerCase().includes(term) ||
        post.slug.toLowerCase().includes(term) ||
        (post.meta_desc ?? '').toLowerCase().includes(term)
    );
  }
  return ordered(rows);
}

/** Each chip's badge: the count over every post, not over the filtered ones. */
export function countPostsByStatus(posts: Post[]): Record<PostStatus, number> {
  return {
    draft: posts.filter((post) => post.status === 'draft').length,
    scheduled: posts.filter((post) => post.status === 'scheduled').length,
    published: posts.filter((post) => post.status === 'published').length,
  };
}

/**
 * The filter and the search are one choice: the chips set the status, the box
 * narrows it, and both decide which rows the panel draws. Keeping them together
 * is what lets the selection hook reset on a change to either (`usePostSelection`).
 */
export function usePostFilters(posts: Post[], initialFilter: PostFilter = 'all') {
  const [activeFilter, setActiveFilter] = useState<PostFilter>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');

  const rows = useMemo(
    () => filterPosts(posts, activeFilter, searchQuery),
    [posts, activeFilter, searchQuery]
  );
  const counts = useMemo(() => countPostsByStatus(posts), [posts]);

  return {
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    rows,
    counts,
    panelId: POSTS_PANEL_ID,
  };
}
