import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { PostSummary } from '@/shared/contracts/blogpress';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  deletePost: vi.fn(),
  restorePost: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: mocks.user, isLoading: false }),
}));

vi.mock('@/frontend/api/blogpress', () => ({
  deletePost: mocks.deletePost,
  restorePost: mocks.restorePost,
  updatePost: vi.fn(),
  createPost: vi.fn(),
  saveAndPublishPost: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

import { PostActionsMenu } from '../post-actions-menu';

/* Radix Popper measures the trigger with ResizeObserver; jsdom does not ship it. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const post: PostSummary = {
  id: 'p1',
  author_id: 'a1',
  slug: 'test-post',
  content: 'هذا هو نص المنشور الكامل.',
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

function openMenu() {
  const trigger = screen.getByRole('button', { name: 'إجراءات المنشور' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return trigger;
}

beforeEach(() => {
  mocks.user = null;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('PostActionsMenu', () => {
  it('renders nothing for non-owners', () => {
    mocks.user = { id: 'someone-else' };
    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'إجراءات المنشور' })).not.toBeInTheDocument();
  });

  it('renders the actions trigger for the author', () => {
    mocks.user = { id: 'a1' };
    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'إجراءات المنشور' })).toBeInTheDocument();
  });

  it('deletes the post after confirmation and offers an undo', async () => {
    mocks.user = { id: 'a1' };
    mocks.deletePost.mockResolvedValue(undefined);
    const onRemoved = vi.fn();
    const onRestored = vi.fn();

    render(<PostActionsMenu post={post} onRemoved={onRemoved} onRestored={onRestored} />);

    openMenu();
    const deleteItem = await screen.findByRole('menuitem', { name: 'حذف' });
    fireEvent.click(deleteItem);

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(mocks.deletePost).toHaveBeenCalledWith('p1'));
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onRestored).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('opens the edit composer prefilled with the post content', async () => {
    mocks.user = { id: 'a1' };

    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={vi.fn()} />);

    openMenu();
    const editItem = await screen.findByRole('menuitem', { name: 'تعديل' });
    fireEvent.click(editItem);

    expect(await screen.findByText('تعديل المنشور')).toBeInTheDocument();
    expect(screen.queryByLabelText(/العنوان/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('هذا هو نص المنشور الكامل.')).toBeInTheDocument();
  });
});
