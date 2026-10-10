import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  session: {
    user: null as { id: string; email?: string } | null,
    isLoading: false,
    isAdmin: false,
    profileName: null as string | null,
    profileAvatarUrl: null as string | null,
    signOut: vi.fn(),
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/shared/constants', () => ({
  getWhatsAppUrl: () => 'https://wa.me/963968478904',
}));

// The Outbox panel owns its own IndexedDB store; keep it inert here so this
// suite tests AccountView's own structure.
vi.mock('@/frontend/state/habitflow/use-outbox-diagnostics', () => ({
  useOutboxDiagnostics: () => ({
    ready: false,
    online: true,
    entries: [],
    pending: 0,
    failed: 0,
    retrying: false,
    retry: vi.fn(),
    removeLocalCopy: vi.fn(),
  }),
}));

import { AccountView } from '../account-view';

/* Radix dialog measures with ResizeObserver; jsdom does not ship it. */
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
  mocks.session.user = null;
  mocks.session.isAdmin = false;
  mocks.session.profileName = null;
  mocks.session.profileAvatarUrl = null;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('AccountView', () => {
  it('shows a sign-in prompt and public rows for guests', () => {
    render(<AccountView />);

    expect(screen.getByText('سجِّل الدُّخول إلى حسابك')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/account'
    );
    expect(screen.getByText('تواصل معنا')).toBeInTheDocument();
    expect(screen.queryByText('طلباتي')).not.toBeInTheDocument();
    expect(screen.queryByText('تسجيل الخروج')).not.toBeInTheDocument();
  });

  it('shows the profile and account rows for signed-in users', () => {
    mocks.session.user = { id: 'u1', email: 'user@example.com' };
    render(<AccountView />);

    expect(screen.getAllByText('user@example.com').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /طلباتي/ })).toHaveAttribute(
      'href',
      '/account/submissions'
    );
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeInTheDocument();
    expect(screen.queryByText('سجِّل الدُّخول إلى حسابك')).not.toBeInTheDocument();
  });
});
