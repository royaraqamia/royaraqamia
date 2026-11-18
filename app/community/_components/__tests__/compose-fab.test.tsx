import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  push: vi.fn(),
  toastSuccess: vi.fn(),
  composerProps: {} as Record<string, unknown>,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: mocks.user, isLoading: false }),
}));

vi.mock('@/frontend/state/UIContext', () => ({
  useUI: () => ({ isReviewSheetOpen: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => '/community',
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock('@/frontend/ui/community/post-composer-dialog', () => ({
  PostComposerDialog: ({
    open,
    onDraftSaved,
    ...props
  }: {
    open: boolean;
    onDraftSaved?: (draft: Record<string, unknown>) => void;
  }) => {
    mocks.composerProps = props;
    return open ? (
      <div>
        <span>composer</span>
        <button
          type="button"
          onClick={() =>
            onDraftSaved?.({
              id: 'draft-1',
              slug: null,
              content: 'مسودة محفوظة',
              coverImage: '',
              metaTitle: '',
              status: 'draft',
              publishAt: null,
            })
          }
        >
          save draft
        </button>
      </div>
    ) : null;
  },
}));

import { ComposeFab } from '../compose-fab';

/* Radix Dialog measures content with ResizeObserver; jsdom does not ship it. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  mocks.user = null;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('ComposeFab', () => {
  it('prompts guests to sign in instead of redirecting', async () => {
    render(<ComposeFab />);

    fireEvent.click(screen.getByRole('button', { name: 'إضافة منشور جديد' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fcommunity'
    );
    expect(screen.queryByText('composer')).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('opens the composer for signed-in users', () => {
    mocks.user = { id: 'u1' };
    render(<ComposeFab />);

    fireEvent.click(screen.getByRole('button', { name: 'إضافة منشور جديد' }));

    expect(screen.getByText('composer')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a saved draft reachable through a toast action', () => {
    mocks.user = { id: 'u1' };
    render(<ComposeFab />);

    fireEvent.click(screen.getByRole('button', { name: 'إضافة منشور جديد' }));
    fireEvent.click(screen.getByRole('button', { name: 'save draft' }));

    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'تمَّ حفظ المسودَّة',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'متابعة التحرير' }),
      })
    );
    expect(mocks.push).not.toHaveBeenCalled();

    const action = mocks.toastSuccess.mock.calls[0]?.[1]?.action as { onClick: () => void };
    act(() => action.onClick());

    expect(mocks.composerProps).toMatchObject({
      mode: 'edit',
      postId: 'draft-1',
      initialBody: 'مسودة محفوظة',
    });
    expect(screen.getByText('composer')).toBeInTheDocument();
  });
});
