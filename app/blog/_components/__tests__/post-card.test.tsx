import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { PostCard } from '../post-card';

const post: PostSummary = {
  id: 'p1',
  author_id: 'a1',
  title: 'مقال تجريبي',
  slug: 'test-post',
  status: 'published',
  cover_image: null,
  meta_title: null,
  meta_desc: 'وصف تجريبي',
  published_at: '2026-01-01T00:00:00.000Z',
  publish_at: null,
  view_count: 0,
  featured: false,
  blog_visible: true,
  reading_time_minutes: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('PostCard', () => {
  it('renders the title', () => {
    render(<PostCard post={post} index={0} />);
    expect(screen.getByText('مقال تجريبي')).toBeInTheDocument();
  });

  it('does not hide the card behind an entrance animation (ADR 0004)', () => {
    const { container } = render(<PostCard post={post} index={0} />);
    const article = container.querySelector('article');

    expect(article).not.toBeNull();
    // A leftover `opacity-0` with no animation to raise it is how the blog
    // grid went blank: the reveal class was removed but the hidden start state
    // stayed. The card must render visible without any animation.
    expect(article?.className).not.toContain('opacity-0');
    expect(article?.getAttribute('style')).toBeNull();
  });

  it('renders a cover image when the post has one', () => {
    render(<PostCard post={{ ...post, cover_image: '/cover.png' }} index={0} />);
    expect(screen.getByAltText('مقال تجريبي')).toBeInTheDocument();
  });
});
