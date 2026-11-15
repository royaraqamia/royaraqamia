import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePostSelection } from '../use-post-selection';
import type { PostFilter } from '../use-post-filters';
import type { Post } from '@/shared/contracts/blogpress';

function post(id: string): Post {
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
  };
}

const rows = [post('a'), post('b')];

describe('usePostSelection', () => {
  it('starts empty, and nothing is "all" over an empty list', () => {
    const { result } = renderHook(() => usePostSelection([], { filter: 'all', query: '' }));

    expect(result.current.selected.size).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });

  it('toggles one id on and off', () => {
    const { result } = renderHook(() => usePostSelection(rows, { filter: 'all', query: '' }));

    act(() => result.current.toggle('a'));
    expect([...result.current.selected]).toEqual(['a']);
    expect(result.current.allSelected).toBe(false);

    act(() => result.current.toggle('a'));
    expect(result.current.selected.size).toBe(0);
  });

  it('selects every filtered row, then clears them', () => {
    const { result } = renderHook(() => usePostSelection(rows, { filter: 'all', query: '' }));

    act(() => result.current.toggleAll());
    expect([...result.current.selected].sort()).toEqual(['a', 'b']);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.selected.size).toBe(0);
  });

  it('drops the selection when the chip changes', () => {
    const { result, rerender } = renderHook(
      (props: { filter: PostFilter }) =>
        usePostSelection(rows, { filter: props.filter, query: '' }),
      { initialProps: { filter: 'all' as PostFilter } }
    );

    act(() => result.current.toggle('a'));
    expect(result.current.selected.size).toBe(1);

    rerender({ filter: 'draft' });
    expect(result.current.selected.size).toBe(0);
  });

  it('drops the selection when the search changes', () => {
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => usePostSelection(rows, { filter: 'all', query }),
      { initialProps: { query: '' } }
    );

    act(() => result.current.toggleAll());
    expect(result.current.selected.size).toBe(2);

    rerender({ query: 'post-a' });
    expect(result.current.selected.size).toBe(0);
  });

  it('clears on its own, which is what a finished bulk action calls', () => {
    const { result } = renderHook(() => usePostSelection(rows, { filter: 'all', query: '' }));

    act(() => result.current.toggleAll());
    act(() => result.current.clear());

    expect(result.current.selected.size).toBe(0);
  });
});
