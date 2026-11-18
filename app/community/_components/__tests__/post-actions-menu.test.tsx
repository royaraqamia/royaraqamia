import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { PostSummary } from '@/shared/contracts/blogpress';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  deletePost: vi.fn(),
  restorePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
  setPostFeatured: vi.fn(),
  downloadPostAsFile: vi.fn(),
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
  publishPost: mocks.publishPost,
  unpublishPost: mocks.unpublishPost,
  setPostFeatured: mocks.setPostFeatured,
  updatePost: vi.fn(),
  createPost: vi.fn(),
  saveAndPublishPost: vi.fn(),
}));

vi.mock('@/frontend/shared/blogpress/export-post', () => ({
  downloadPostAsFile: mocks.downloadPostAsFile,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

// The composer's body is Tiptap; this suite is about the menu handing it the
// right Markdown, so the surface stays a plain field.
vi.mock('@/frontend/ui/notes/note-body-editor', () => ({
  NoteBodyEditor: ({ initialMarkdown }: { initialMarkdown: string }) => (
    <textarea id="composer-body" aria-label="نص المنشور" defaultValue={initialMarkdown} />
  ),
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
    mocks.deletePost.mockResolvedValue({ updatedAt: '2026-11-15T09:00:00.000Z' });
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

  it('sends the delete stamp on undo, never the body the row was painted from', async () => {
    mocks.user = { id: 'a1' };
    mocks.deletePost.mockResolvedValue({ updatedAt: '2026-11-15T09:00:00.000Z' });
    mocks.restorePost.mockResolvedValue(undefined);
    const onRestored = vi.fn();

    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={onRestored} />);

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'حذف' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(mocks.deletePost).toHaveBeenCalled());
    const options = mocks.toastSuccess.mock.calls[0]?.[1] as {
      action: { label: string; onClick: () => Promise<void> };
    };
    expect(options.action.label).toBe('تراجع');

    await options.action.onClick();

    expect(mocks.restorePost).toHaveBeenCalledWith({
      id: 'p1',
      updatedAt: '2026-11-15T09:00:00.000Z',
    });
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal when the tombstone moved on", async () => {
    mocks.user = { id: 'a1' };
    mocks.deletePost.mockResolvedValue({ updatedAt: '2026-11-15T09:00:00.000Z' });
    mocks.restorePost.mockRejectedValue(
      new Error('تغيَّر المنشور بعد الحذف، فأعِد تحميل الصَّفحة لتستعيد أحدث نُسخة.')
    );
    const onRestored = vi.fn();

    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={onRestored} />);

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'حذف' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(mocks.deletePost).toHaveBeenCalled());
    const options = mocks.toastSuccess.mock.calls[0]?.[1] as {
      action: { onClick: () => Promise<void> };
    };

    await options.action.onClick();

    expect(mocks.toastError).toHaveBeenCalledWith(
      'تغيَّر المنشور بعد الحذف، فأعِد تحميل الصَّفحة لتستعيد أحدث نُسخة.'
    );
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('opens the edit composer prefilled with the post content', async () => {
    mocks.user = { id: 'a1' };

    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={vi.fn()} />);

    openMenu();
    const editItem = await screen.findByRole('menuitem', { name: 'تعديل' });
    fireEvent.click(editItem);

    expect(await screen.findByText('تعديل المنشور')).toBeInTheDocument();
    expect(screen.queryByLabelText(/العنوان/)).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('هذا هو نص المنشور الكامل.')).toBeInTheDocument();
  });

  it('offers only the three added owner actions, without the withdrawn ones', async () => {
    mocks.user = { id: 'a1' };
    mocks.unpublishPost.mockResolvedValue(undefined);

    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={vi.fn()} />);

    openMenu();
    expect(await screen.findByRole('menuitem', { name: /إلغاء الن/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'تثبيت' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'تصدير Markdown' })).toBeInTheDocument();
    for (const withdrawn of ['نسخ المنشور', 'عرض المنشور', 'تصدير HTML']) {
      expect(screen.queryByRole('menuitem', { name: withdrawn })).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('menuitem', { name: /إلغاء الن/ }));
    await waitFor(() => expect(mocks.unpublishPost).toHaveBeenCalledWith('p1'));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('publishes a draft now and unpins a featured post', async () => {
    mocks.user = { id: 'a1' };
    mocks.publishPost.mockResolvedValue(undefined);
    mocks.setPostFeatured.mockResolvedValue(undefined);

    render(
      <PostActionsMenu
        post={{ ...post, status: 'draft', featured: true }}
        onRemoved={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'نشر' }));
    await waitFor(() => expect(mocks.publishPost).toHaveBeenCalledWith('p1'));

    cleanup();
    render(
      <PostActionsMenu
        post={{ ...post, featured: true }}
        onRemoved={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /إلغاء الت/ }));
    await waitFor(() => expect(mocks.setPostFeatured).toHaveBeenCalledWith('p1', false));
  });

  it('exports Markdown named from the post body', async () => {
    mocks.user = { id: 'a1' };
    mocks.downloadPostAsFile.mockResolvedValue(undefined);

    render(<PostActionsMenu post={post} onRemoved={vi.fn()} onRestored={vi.fn()} />);

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'تصدير Markdown' }));
    await waitFor(() =>
      expect(mocks.downloadPostAsFile).toHaveBeenCalledWith(
        'هذا هو نص المنشور الكامل.',
        'هذا هو نص المنشور الكامل.'
      )
    );
  });
});
