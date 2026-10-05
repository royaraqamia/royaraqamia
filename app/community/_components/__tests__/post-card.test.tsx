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
  published_at: '2026-01-01T00:00:00.000Z',
  publish_at: null,
  view_count: 0,
  featured: false,
  community_visible: true,
  reading_time_minutes: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('PostCard', () => {
  it('does not render the post title inline', () => {
    render(<PostCard post={post} index={0} />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('renders the post body text', () => {
    render(<PostCard post={post} index={0} />);
    expect(screen.getByText('هذا هو نص المنشور الكامل الذي يجب أن يظهر.')).toBeInTheDocument();
  });

  it('strips markdown syntax from the body so raw markers stay off the card', () => {
    render(
      <PostCard post={{ ...post, content: 'استمع إلى **الذكاء الاصطناعي** الآن.' }} index={0} />
    );

    expect(screen.getByText('استمع إلى الذكاء الاصطناعي الآن.')).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('does not hide the card behind an entrance animation (ADR 0004)', () => {
    const { container } = render(<PostCard post={post} index={0} />);
    const article = container.querySelector('article');

    expect(article).not.toBeNull();
    // A leftover `opacity-0` with no animation to raise it is how the community
    // grid went blank: the reveal class was removed but the hidden start state
    // stayed. The card must render visible without any animation.
    expect(article?.className).not.toContain('opacity-0');
    expect(article?.getAttribute('style')).toBeNull();
  });

  it('renders a cover image when the post has one', () => {
    render(<PostCard post={{ ...post, cover_image: '/cover.png' }} index={0} />);
    expect(screen.getByAltText('هذا هو نص المنشور الكامل الذي يجب أن يظهر.')).toBeInTheDocument();
  });

  it('renders the publisher name and avatar', () => {
    render(
      <PostCard
        post={{
          ...post,
          author: { name: 'رؤى رقميّة', avatar_url: '/avatar.png' },
        }}
        index={0}
      />
    );

    expect(screen.getByText('رؤى رقميّة')).toBeInTheDocument();
    expect(screen.getByAltText('رؤى رقميّة')).toHaveAttribute(
      'src',
      expect.stringContaining('avatar.png')
    );
  });

  it('omits the publisher block when there is no author', () => {
    render(<PostCard post={{ ...post, author: null }} index={0} />);
    expect(screen.queryByText('رؤى رقميّة')).not.toBeInTheDocument();
  });

  it('renders a share button', () => {
    render(<PostCard post={post} index={0} />);
    expect(screen.getByRole('button', { name: 'مشاركة المنشور' })).toBeInTheDocument();
  });

  it('hides the owner actions menu from anonymous visitors', () => {
    render(<PostCard post={post} index={0} />);
    expect(screen.queryByRole('button', { name: 'إجراءات المنشور' })).not.toBeInTheDocument();
  });
});
