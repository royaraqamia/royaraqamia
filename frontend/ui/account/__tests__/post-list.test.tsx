import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/frontend/api/blogpress', () => ({
  bulkPostAction: vi.fn(),
  deletePost: vi.fn(),
  duplicatePost: vi.fn(),
  publishPost: vi.fn(),
  restorePost: vi.fn(),
  setPostFeatured: vi.fn(),
  unpublishPost: vi.fn(),
}));

import { PostList } from '../post-list';
import type { Post } from '@/shared/contracts/blogpress';

function post(id: string, status: Post['status'] = 'draft'): Post {
  return {
    id,
    author_id: 'u1',
    slug: `post-${id}`,
    content: `منشور ${id}`,
    status,
    cover_image: null,
    meta_title: null,
    meta_desc: null,
    published_at: status === 'published' ? '2026-01-01T00:00:00.000Z' : null,
    publish_at: null,
    view_count: 0,
    featured: false,
    community_visible: true,
    reading_time_minutes: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderList() {
  return render(
    <PostList
      posts={[post('a'), post('b')]}
      onEdit={vi.fn()}
      onChanged={vi.fn()}
      onCreate={vi.fn()}
    />
  );
}

describe('PostList', () => {
  it('draws the bulk actions only once a row is selected', () => {
    renderList();

    // The count and select-all are always there; a bordered toolbar holding
    // three buttons that cannot be pressed is not.
    expect(screen.getByRole('checkbox', { name: 'تحديد الكل' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نشر' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'تحديد المنشور' })[0]!);

    expect(screen.getByRole('button', { name: 'نشر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء النَّشر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
  });

  it('names the panel back to the chip that selected it', () => {
    renderList();

    const panel = screen.getByRole('tabpanel');

    expect(panel).toHaveAttribute('id', 'account-posts-panel');
    expect(panel).toHaveAttribute('aria-labelledby', 'account-posts-tab-all');
    expect(screen.getByRole('tab', { name: /الكل/ })).toHaveAttribute(
      'aria-controls',
      'account-posts-panel'
    );
  });
});
