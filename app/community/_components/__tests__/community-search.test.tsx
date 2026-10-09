import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommunitySearch } from '../community-search';
import type { CommunitySearchResult } from '@/shared/contracts/community';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/frontend/ui/shared/member-avatar', () => ({
  MemberAvatar: () => <span data-testid="avatar" />,
}));

const results: CommunitySearchResult = {
  people: [{ id: 'u-1', username: 'ahmad', name: 'أحمد', avatar_url: null, bio: null }],
  posts: [
    {
      id: 'p-1',
      author_id: 'u-1',
      slug: 'hello-world',
      content: 'مقدّمة عن البرمجة',
      status: 'published',
      cover_image: null,
      meta_title: null,
      meta_desc: 'درس تمهيدي',
      published_at: '2026-01-01T00:00:00.000Z',
      publish_at: null,
      view_count: 0,
      featured: false,
      community_visible: true,
      reading_time_minutes: 3,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const fetchMock = vi.fn();

describe('CommunitySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => results });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function typeQuery(value: string) {
    fireEvent.change(screen.getByRole('combobox'), { target: { value } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  }

  it('shows people and posts suggestions as the visitor types', async () => {
    render(<CommunitySearch />);

    await typeQuery('ahmad');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/community/search?q=ahmad',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(screen.getByText('أشخاص')).toBeInTheDocument();
    expect(screen.getByText('منشورات')).toBeInTheDocument();
    expect(screen.getByText('أحمد')).toBeInTheDocument();
    expect(screen.getByText('درس تمهيدي')).toBeInTheDocument();
  });

  it('opens a member profile when a person result is chosen', async () => {
    render(<CommunitySearch />);

    await typeQuery('ahmad');
    fireEvent.click(screen.getByText('أحمد'));

    expect(push).toHaveBeenCalledWith('/u/ahmad');
  });

  it('commits the query to the feed on Enter', async () => {
    render(<CommunitySearch />);

    await typeQuery('ahmad');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/community?q=ahmad');
  });
});
