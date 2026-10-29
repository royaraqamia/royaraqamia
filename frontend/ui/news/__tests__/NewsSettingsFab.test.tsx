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
  useRouter: () => ({ push: mocks.push }),
}));

import { NewsSettingsFab } from '../NewsSettingsFab';

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

describe('NewsSettingsFab', () => {
  it('prompts a guest to sign in and returns them to the sources page', async () => {
    render(<NewsSettingsFab />);

    fireEvent.click(screen.getByRole('button', { name: 'مصادر الأخبار' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Faccount%2Fnews'
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('opens the news sources for a signed-in reader', () => {
    mocks.user = { id: 'u1' };
    render(<NewsSettingsFab />);

    fireEvent.click(screen.getByRole('button', { name: 'مصادر الأخبار' }));

    expect(mocks.push).toHaveBeenCalledWith('/account/news');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
