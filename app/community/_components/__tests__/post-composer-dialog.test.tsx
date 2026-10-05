import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  saveAndPublishPost: vi.fn(),
  updatePost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/frontend/api/blogpress', () => ({
  createPost: mocks.createPost,
  saveAndPublishPost: mocks.saveAndPublishPost,
  updatePost: mocks.updatePost,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { PostComposerDialog } from '../post-composer-dialog';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('PostComposerDialog', () => {
  it('edits an existing post, keeping its slug and recomputing the description', async () => {
    mocks.updatePost.mockResolvedValue({ message: 'تمَّ حفظ المنشور' });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <PostComposerDialog
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        mode="edit"
        postId="p1"
        slug="test-post"
        initialTitle="منشور تجريبي"
        initialBody="النص الأصلي للمنشور."
      />
    );

    expect(screen.getByText('تعديل المنشور')).toBeInTheDocument();

    const body = screen.getByLabelText(/النَّص/);
    fireEvent.change(body, { target: { value: 'نص محدَّث طويل بما يكفي.' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
    expect(mocks.updatePost).toHaveBeenCalledWith('p1', {
      title: 'منشور تجريبي',
      slug: 'test-post',
      content: 'نص محدَّث طويل بما يكفي.',
      cover_image: '',
      meta_title: '',
      meta_desc: 'نص محدَّث طويل بما يكفي.',
    });
    expect(onSaved).toHaveBeenCalledWith('test-post');
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it('creates and publishes a new post', async () => {
    mocks.createPost.mockResolvedValue({ id: 'p9' });
    mocks.saveAndPublishPost.mockResolvedValue({ success: true });
    const onSaved = vi.fn();

    render(<PostComposerDialog open onOpenChange={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: 'عنوان جديد' } });
    fireEvent.change(screen.getByLabelText(/النَّص/), { target: { value: 'محتوى المنشور.' } });
    fireEvent.click(screen.getByRole('button', { name: 'نشر' }));

    await waitFor(() => expect(mocks.saveAndPublishPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost).toHaveBeenCalledTimes(1);
    expect(mocks.saveAndPublishPost).toHaveBeenCalledWith(
      'p9',
      expect.objectContaining({
        title: 'عنوان جديد',
        content: 'محتوى المنشور.',
        slug: expect.stringMatching(/^post-/),
      })
    );
    expect(onSaved).toHaveBeenCalledWith(expect.stringMatching(/^post-/));
    expect(mocks.updatePost).not.toHaveBeenCalled();
  });

  it('rejects an empty title without calling the API', () => {
    render(<PostComposerDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/النَّص/), { target: { value: 'محتوى.' } });
    fireEvent.click(screen.getByRole('button', { name: 'نشر' }));

    expect(mocks.toastError).toHaveBeenCalledWith('العنوان مطلوب');
    expect(mocks.createPost).not.toHaveBeenCalled();
  });
});
