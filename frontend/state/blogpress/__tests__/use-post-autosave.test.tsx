import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { usePostAutosave } from '@/frontend/state/blogpress/use-post-autosave';
import type { Post } from '@/shared/contracts/blogpress';

const mocks = vi.hoisted(() => ({
  updatePost: vi.fn(),
}));

vi.mock('@/frontend/api/blogpress', () => ({
  updatePost: mocks.updatePost,
}));

const mockPost: Post = {
  id: 'post-1',
  author_id: 'author-1',
  title: 'العنوان الأصلي',
  slug: 'post-1',
  content: '',
  status: 'draft',
  cover_image: null,
  meta_title: null,
  meta_desc: null,
  published_at: null,
  publish_at: null,
  view_count: 0,
  featured: false,
  blog_visible: false,
  reading_time_minutes: 1,
  created_at: '2026-08-18T08:00:00.000Z',
  updated_at: '2026-08-18T08:00:00.000Z',
};

function Harness({ post }: { post: Post }) {
  const { title, setTitle, isDirty } = usePostAutosave(post);
  return (
    <div>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="title">{title}</span>
      <button onClick={() => setTitle('العنوان الجديد')}>edit</button>
    </div>
  );
}

function makeDirty() {
  fireEvent.click(screen.getByText('edit'));
  return waitFor(() => expect(screen.getByTestId('dirty')).toHaveTextContent('true'));
}

describe('usePostAutosave (⌘/Ctrl+S shortcut)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePost.mockResolvedValue({ message: 'تمَّ حفظ المقال' });
  });

  it('saves immediately on Ctrl+S when there are pending changes', async () => {
    render(<Harness post={mockPost} />);
    await makeDirty();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    });

    await waitFor(() => {
      expect(mocks.updatePost).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({ title: 'العنوان الجديد' })
      );
    });
  });

  it('saves immediately on Meta+S (macOS) when there are pending changes', async () => {
    render(<Harness post={mockPost} />);
    await makeDirty();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    });

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalled());
  });

  it('does not save on a bare `s` keypress', async () => {
    render(<Harness post={mockPost} />);
    await makeDirty();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.updatePost).not.toHaveBeenCalled();
  });
});
