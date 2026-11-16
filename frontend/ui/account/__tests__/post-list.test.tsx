import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

function renderList(posts: Post[] = [post('a'), post('b')]) {
  return render(<PostList posts={posts} onEdit={vi.fn()} onChanged={vi.fn()} onCreate={vi.fn()} />);
}

/**
 * The selectors `shared/visual/account-posts.json` names for this list. The
 * contract is the reviewed target list for a page that will not have a port
 * (ADR-0118's #1520 amendment), so a selector it names and the list no longer
 * draws is the contract describing a page that is gone. The create button is the
 * ninth and belongs to `AccountPostsView`.
 */
const CONTRACT_SELECTORS = (() => {
  const contract = JSON.parse(
    readFileSync(join(process.cwd(), 'shared', 'visual', 'account-posts.json'), 'utf8')
  ) as { states: { elements: { name: string; web: { selector: string } }[] }[] };
  const selectors = new Set<string>();
  for (const state of contract.states) {
    for (const element of state.elements) {
      if (element.name !== 'fab') selectors.add(element.web.selector);
    }
  }
  return [...selectors];
})();

/** Select the first row, which is the one under test unless a case says otherwise. */
function selectFirst() {
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'تحديد المنشور' })[0]!);
}

describe('PostList', () => {
  it('draws the bulk actions only once a row is selected', () => {
    renderList();

    // The count and select-all are always there; a bordered toolbar holding
    // three buttons that cannot be pressed is not.
    expect(screen.getByRole('checkbox', { name: 'تحديد الكل' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نشر' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();

    selectFirst();

    expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
  });

  it('offers only the move a draft selection has', () => {
    renderList([post('a', 'draft'), post('b', 'scheduled')]);
    selectFirst();

    // Neither row is published, so a bulk unpublish would report `0 affected`.
    expect(screen.getByRole('button', { name: 'نشر' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إلغاء النَّشر' })).not.toBeInTheDocument();
  });

  it('offers only the move a published selection has', () => {
    renderList([post('a', 'published'), post('b', 'published')]);
    selectFirst();

    expect(screen.getByRole('button', { name: 'إلغاء النَّشر' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نشر' })).not.toBeInTheDocument();
  });

  it('names both moves by what they will do on a mixed selection', () => {
    renderList([post('a', 'published'), post('b', 'draft')]);

    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد الكل' }));

    expect(screen.getByRole('button', { name: 'نشر المسودَّات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء نشر المنشورة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نشر' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إلغاء النَّشر' })).not.toBeInTheDocument();
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

  it('names every box its visual contract measures', () => {
    // `shared/visual/account-posts.json` measures these by name, so the page has
    // to carry them: without one, the contract describes a page that is gone.
    const { container } = renderList();

    expect(CONTRACT_SELECTORS).toHaveLength(8);
    for (const selector of CONTRACT_SELECTORS) {
      expect(container.querySelector(selector), selector).not.toBeNull();
    }
  });
});
