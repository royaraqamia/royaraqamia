import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  loggerError: vi.fn(),
  assign: vi.fn(),
}));

vi.mock('@/frontend/api/blogpress', () => ({
  createPost: mocks.createPost,
  deletePost: vi.fn(),
  unpublishPost: vi.fn(),
  publishPost: vi.fn(),
  setPostFeatured: vi.fn(),
  duplicatePost: vi.fn(),
  restorePost: vi.fn(),
  bulkPostAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
  },
}));

vi.mock('@/frontend/shared/logger', () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => '/blogpress',
}));

import { CreatePostButton } from '../create-post-button';
import { PostList } from '../post-list';
import { CREATE_POST_FAILED_MESSAGE } from '../create-post';

const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  /* jsdom makes `location.assign` non-configurable, so the whole location is swapped. */
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: mocks.assign },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('failed new-post creation', () => {
  it('shows an Arabic error, logs it and stays retryable from the header button', async () => {
    mocks.createPost.mockRejectedValue(new Error('offline'));

    render(<CreatePostButton />);

    const button = screen.getByRole('button', { name: 'إنشاء منشور جديد' });
    fireEvent.click(button);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(CREATE_POST_FAILED_MESSAGE));
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining('createPost'),
      expect.objectContaining({ operation: 'createPost', error: 'offline' })
    );
    expect(mocks.assign).not.toHaveBeenCalled();

    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(2));
  });

  it('shows an Arabic error and does not navigate from the empty-state button', async () => {
    mocks.createPost.mockRejectedValue(new Error('server error'));

    render(<PostList posts={[]} categories={[]} />);

    const button = screen.getByRole('button', { name: 'منشور جديد' });
    fireEvent.click(button);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(CREATE_POST_FAILED_MESSAGE));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining('createPost'),
      expect.objectContaining({ operation: 'createPost', error: 'server error' })
    );

    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(2));
  });
});
