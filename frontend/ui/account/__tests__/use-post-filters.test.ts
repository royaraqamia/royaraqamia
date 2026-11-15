import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  countPostsByStatus,
  filterPosts,
  POST_FILTERS,
  POSTS_PANEL_ID,
  usePostFilters,
} from '../use-post-filters';
import type { Post } from '@/shared/contracts/blogpress';

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    author_id: 'u1',
    slug: `post-${id}`,
    content: `منشور ${id}`,
    status: 'draft',
    cover_image: null,
    meta_title: null,
    meta_desc: null,
    published_at: null,
    publish_at: null,
    view_count: 0,
    featured: false,
    community_visible: true,
    reading_time_minutes: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterPosts', () => {
  const posts = [
    post('a', { status: 'draft' }),
    post('b', { status: 'published' }),
    post('c', { status: 'published', featured: true }),
  ];

  it('keeps the rows the chip names', () => {
    expect(filterPosts(posts, 'published', '').map((row) => row.id)).toEqual(['c', 'b']);
    expect(filterPosts(posts, 'scheduled', '').map((row) => row.id)).toEqual([]);
    expect(filterPosts(posts, 'all', '')).toHaveLength(3);
  });

  it('pins first without dropping the store order of the rest', () => {
    expect(filterPosts(posts, 'all', '').map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('searches the body, the slug and the description, trimmed and case-folded', () => {
    expect(filterPosts(posts, 'all', '  POST-B ').map((row) => row.id)).toEqual(['b']);
    expect(
      filterPosts([post('d', { meta_desc: 'عن الكتابة' })], 'all', 'الكتابة').map((row) => row.id)
    ).toEqual(['d']);
    expect(filterPosts(posts, 'all', 'لا شيء')).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const order = posts.map((row) => row.id);
    filterPosts(posts, 'all', '');
    expect(posts.map((row) => row.id)).toEqual(order);
  });
});

describe('countPostsByStatus', () => {
  it('counts every post, not the filtered ones', () => {
    expect(
      countPostsByStatus([
        post('a'),
        post('b', { status: 'published' }),
        post('c', { status: 'scheduled' }),
        post('d', { status: 'published' }),
      ])
    ).toEqual({ draft: 1, scheduled: 1, published: 2 });
  });
});

describe('usePostFilters', () => {
  const posts = [post('a'), post('b', { status: 'published' })];

  it('starts on the filter the route asked for, and the full list', () => {
    const { result } = renderHook(() => usePostFilters(posts, 'published'));

    expect(result.current.activeFilter).toBe('published');
    expect(result.current.rows.map((row) => row.id)).toEqual(['b']);
    expect(result.current.panelId).toBe(POSTS_PANEL_ID);
    expect(result.current.counts).toEqual({ draft: 1, scheduled: 0, published: 1 });
  });

  it('narrows the rows on a search without touching the counts', () => {
    const { result } = renderHook(() => usePostFilters(posts));

    act(() => result.current.setSearchQuery('post-a'));

    expect(result.current.rows.map((row) => row.id)).toEqual(['a']);
    expect(result.current.counts.draft).toBe(1);
  });

  it('gives each chip a status and an id', () => {
    expect(POST_FILTERS.map((filter) => filter.value)).toEqual([
      'all',
      'draft',
      'scheduled',
      'published',
    ]);
  });
});
