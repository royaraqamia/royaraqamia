import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { PostCard } from '../post-card';

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: null, isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const post: PostSummary = {
  id: 'p1',
  author_id: 'a1',
  slug: 'test-post',
  content: 'هذا هو نص المنشور الكامل الذي يجب أن يظهر.',
  status: 'published',
  cover_image: null,
  meta_title: null,
  meta_desc: 'وصف تجريبي',
  published_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  publish_at: null,
  view_count: 25,
  featured: false,
  community_visible: true,
  reading_time_minutes: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/**
 * The card's two rows (ADR-0201's card decision): facts about the post on a quiet
 * meta line, actions in a bar below it, and no third line where the date used to
 * wrap on a small screen.
 */
describe('PostCard meta and actions', () => {
  it('shows the views and the age on the meta line', () => {
    render(<PostCard post={{ ...post, published_at: null }} index={0} />);
    expect(screen.getByLabelText('25 مشاهدة')).toBeInTheDocument();
  });

  it('speaks in «قبل» on the card, and leaves the exact date to the post page', () => {
    const { container } = render(<PostCard post={post} index={0} />);
    const time = container.querySelector('time');

    expect(time?.textContent).toMatch(/قبل|الآن/);
    // The Hijri month the card used to print is the post page's line now.
    expect(container.textContent).not.toMatch(/جمادى|رجب|شعبان|رمضان|محرم|صفر|ربيع/);
  });

  it('hands the like and comment cells to the post itself, not a placeholder', () => {
    render(<PostCard post={post} index={0} />);

    expect(screen.getByRole('button', { name: 'إعجاب' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: 'التعليقات' })).toHaveAttribute(
      'href',
      '/community/test-post#comments'
    );
  });

  it('renders no figure for a post nobody has opened', () => {
    render(<PostCard post={{ ...post, view_count: 0 }} index={0} />);
    expect(screen.queryByLabelText(/مشاهدة/)).toBeNull();
  });
});
