import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  push: vi.fn(),
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

vi.mock('../post-composer-dialog', () => ({
  PostComposerDialog: ({ open }: { open: boolean }) => (open ? <div>composer</div> : null),
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
});
