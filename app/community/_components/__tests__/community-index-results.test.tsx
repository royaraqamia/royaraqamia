import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { CommunityIndexResults } from '../community-index-results';

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
}));

vi.mock('../post-card', () => ({
  PostCard: ({ post }: { post: PostSummary }) => <div>{post.content}</div>,
}));

const fetchMock = vi.fn();

function post(id: string, content: string): PostSummary {
  return {
    id,
    author_id: 'u-1',
    slug: id,
    content,
    status: 'published',
    cover_image: null,
    meta_title: null,
    meta_desc: null,
    published_at: '2026-01-01T00:00:00.000Z',
    publish_at: null,
    view_count: 0,
    featured: false,
    community_visible: true,
    reading_time_minutes: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function indexResponse(posts: PostSummary[], nextCursor: string | null = null) {
  return { ok: true, json: async () => ({ posts, nextCursor }) };
}

describe('CommunityIndexResults', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a needs-connection state when load-more fails, and appends the page on retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(
      <CommunityIndexResults
        initialPosts={[post('p-1', 'المنشور الأول')]}
        initialNextCursor="cursor-1"
      />
    );

    fireEvent.click(screen.getByRole('link', { name: 'تحميل المزيد من المنشورات' }));

    await waitFor(() => expect(screen.getByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: 'تحميل المزيد من المنشورات' })
    ).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(indexResponse([post('p-2', 'المنشور الثاني')]));
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => expect(screen.getByText('المنشور الثاني')).toBeInTheDocument());
    expect(screen.getByText('المنشور الأول')).toBeInTheDocument();
    expect(screen.queryByText('يتطلَّب الاتصال بالإنترنت')).not.toBeInTheDocument();
  });

  it('shows a connection error instead of the empty state when a search fails, and retries it', async () => {
    nav.params = new URLSearchParams('q=ahmad');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<CommunityIndexResults initialPosts={[]} initialNextCursor={null} />);

    await waitFor(() => expect(screen.getByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument());
    expect(screen.queryByText('لا توجد نتائج للبحث')).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(indexResponse([post('p-1', 'نتيجة البحث')]));
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => expect(screen.getByText('نتيجة البحث')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/community/index?q=ahmad',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('does not request page one when the default feed is prerendered', () => {
    render(
      <CommunityIndexResults
        initialPosts={[post('p-1', 'المنشور الأول')]}
        initialNextCursor={null}
      />
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('المنشور الأول')).toBeInTheDocument();
  });
});
