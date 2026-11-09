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

import { LinksnapLinksFab } from '../linksnap-links-fab';

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

describe('LinksnapLinksFab', () => {
  it('prompts a guest to sign in and returns them to the links page', async () => {
    render(<LinksnapLinksFab />);

    fireEvent.click(screen.getByRole('button', { name: 'روابطي' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Faccount%2Flinks'
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('opens the owned links for a signed-in reader', () => {
    mocks.user = { id: 'u1' };
    render(<LinksnapLinksFab />);

    fireEvent.click(screen.getByRole('button', { name: 'روابطي' }));

    expect(mocks.push).toHaveBeenCalledWith('/account/links');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
