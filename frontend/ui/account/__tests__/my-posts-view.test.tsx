import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { ApiError } from '@/frontend/transport/http';

const api = vi.hoisted(() => ({
  getMyPosts: vi.fn(),
}));

vi.mock('@/frontend/api/me', () => api);

const session = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock('@/frontend/state/session-provider', () => session);

vi.mock('@/app/community/_components/post-card', () => ({
  PostCard: ({ post }: { post: { slug: string } }) => <article>{post.slug}</article>,
}));

import { MyPostsView } from '../my-posts-view';

const POST = { id: 'p1', slug: 'first-post' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
  api.getMyPosts.mockResolvedValue({ posts: [POST], nextCursor: null });
});

afterEach(cleanup);

describe('MyPostsView', () => {
  it('points a guest at sign-in without reading the feed', async () => {
    session.useSession.mockReturnValue({ user: null, isLoading: false });
    render(<MyPostsView />);

    expect(await screen.findByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/account/posts'
    );
    expect(api.getMyPosts).not.toHaveBeenCalled();
  });

  it('renders the member’s own published posts as cards', async () => {
    render(<MyPostsView />);

    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(screen.getByText('first-post')).toBeInTheDocument();
  });

  it('renders the empty state for a genuinely empty feed', async () => {
    api.getMyPosts.mockResolvedValue({ posts: [], nextCursor: null });
    render(<MyPostsView />);

    expect(await screen.findByText('لا توجد منشورات بعد')).toBeInTheDocument();
  });

  it('names the connection when the read never reached the server', async () => {
    api.getMyPosts.mockRejectedValue(
      new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.')
    );
    render(<MyPostsView />);

    expect(await screen.findByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();

    api.getMyPosts.mockResolvedValue({ posts: [POST], nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('renders the ordinary error card for a server-answered failure', async () => {
    api.getMyPosts.mockRejectedValue(new ApiError('غير مصرح', 401));
    render(<MyPostsView />);

    expect(await screen.findByText('تعذَّر تحميل المنشورات')).toBeInTheDocument();
    expect(screen.queryByText('يتطلَّب الاتصال بالإنترنت')).not.toBeInTheDocument();
  });
});
