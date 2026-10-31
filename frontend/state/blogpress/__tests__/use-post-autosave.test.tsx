import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { usePostAutosave, type PostPersist } from '@/frontend/state/blogpress/use-post-autosave';
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
  community_visible: false,
  reading_time_minutes: 1,
  created_at: '2026-08-18T08:00:00.000Z',
  updated_at: '2026-08-18T08:00:00.000Z',
};

function Harness({ post }: { post: Post }) {
  const { content, setContent, isDirty } = usePostAutosave(post);
  return (
    <div>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="content">{content}</span>
      <button onClick={() => setContent('النص الجديد')}>edit</button>
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
    mocks.updatePost.mockResolvedValue({ message: 'تمَّ حفظ المنشور' });
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
        expect.objectContaining({ content: 'النص الجديد' })
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function PersistHarness({ post, persist }: { post: Post; persist: NonNullable<PostPersist> }) {
  const { content, setContent, isDirty, isSaving, lastSaved } = usePostAutosave(post, persist);
  return (
    <div>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="saving">{String(isSaving)}</span>
      <span data-testid="saved">{lastSaved ? 'yes' : 'no'}</span>
      <span data-testid="content">{content}</span>
      <button onClick={() => setContent('النص الأول')}>first</button>
      <button onClick={() => setContent('النص الثاني')}>second</button>
    </div>
  );
}

describe('usePostAutosave (edit while a save is in flight)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists an edit typed while the older snapshot is still being written', async () => {
    const firstWrite = deferred<boolean>();
    const persist = vi.fn().mockReturnValueOnce(firstWrite.promise).mockResolvedValue(true);

    render(<PersistHarness post={mockPost} persist={persist} />);

    fireEvent.click(screen.getByText('first'));
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');

    // The debounce fires and the first write stays in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'النص الأول' }));
    expect(screen.getByTestId('saving')).toHaveTextContent('true');

    // Typing mid-write must not be marked clean by the older write's success.
    fireEvent.click(screen.getByText('second'));
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');

    await act(async () => {
      firstWrite.resolve(true);
      await firstWrite.promise;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'النص الثاني' }));
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
    expect(screen.getByTestId('saving')).toHaveTextContent('false');
    expect(screen.getByTestId('saved')).toHaveTextContent('yes');

    // The re-armed debounce finds nothing left to write.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('writes once when nothing changed while the save was in flight', async () => {
    const persist = vi.fn().mockResolvedValue(true);

    render(<PersistHarness post={mockPost} persist={persist} />);

    fireEvent.click(screen.getByText('first'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
