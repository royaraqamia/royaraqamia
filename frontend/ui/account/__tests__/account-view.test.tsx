import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  session: {
    user: null as { id: string; email?: string } | null,
    isLoading: false,
    isAdmin: false,
    profileName: null as string | null,
    profileAvatarUrl: null as string | null,
    profileUsername: null as string | null,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/shared/constants', () => ({
  getWhatsAppUrl: () => 'https://wa.me/963968478904',
}));

/* The install row reads the PWA context; it has its own suite. */
vi.mock('@/frontend/ui/account/install-section', () => ({
  InstallSection: () => null,
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
  it('shows every action row to guests, with admin and logout hidden', () => {
    render(<AccountView />);

    expect(screen.getByText('سجِّل الدُّخول إلى حسابك')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/account'
    );
    expect(screen.getByText('تواصل معنا')).toBeInTheDocument();

    // The FAQ row is public: a guest gets a link, not the sign-in prompt.
    expect(screen.getByRole('link', { name: /الأسئلة الشَّائعة/ })).toHaveAttribute(
      'href',
      '/account/faq'
    );

    // Gated rows are visible, but as buttons rather than links.
    for (const label of ['طلباتي', 'المنشورات', 'الرَّوابط المختصَرة', 'التَّطبيقات المتَّصلة']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument();
    }

    expect(screen.queryByText('الإدارة')).not.toBeInTheDocument();
    expect(screen.queryByText('تسجيل الخروج')).not.toBeInTheDocument();
  });

  it('prompts guests to sign in and returns them to the row they picked', async () => {
    render(<AccountView />);

    fireEvent.click(screen.getByRole('button', { name: /التَّطبيقات المتَّصلة/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Faccount%2Fconnected-apps'
    );
  });

  it('shows the profile and account rows for signed-in users', () => {
    mocks.session.user = { id: 'u1', email: 'user@example.com' };
    render(<AccountView />);

    expect(screen.getAllByText('user@example.com').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /طلباتي/ })).toHaveAttribute(
      'href',
      '/account/submissions'
    );
    expect(screen.getByRole('link', { name: /التَّطبيقات المتَّصلة/ })).toHaveAttribute(
      'href',
      '/account/connected-apps'
    );
    expect(screen.getByRole('link', { name: /الأسئلة الشَّائعة/ })).toHaveAttribute(
      'href',
      '/account/faq'
    );
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeInTheDocument();
    expect(screen.queryByText('سجِّل الدُّخول إلى حسابك')).not.toBeInTheDocument();
  });
});
