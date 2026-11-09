import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

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

// The guest gate's CTA dismisses the prompt through the app router.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/frontend/shared/constants', () => ({
  SUPPORT_USERNAME: 'royaraqamia',
}));

/* The install row reads the PWA context; it has its own suite. */
vi.mock('@/frontend/ui/account/install-section', () => ({
  InstallSection: () => null,
}));

/* The usage card has its own suite; this one must not issue an account read. */
vi.mock('@/frontend/state/plans/use-my-plan', () => ({
  useMyUsage: () => ({ state: null, loading: false, failed: false, reload: vi.fn() }),
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

    // Support is a chat with the site's own account, not WhatsApp.
    expect(screen.getByRole('link', { name: /تواصل معنا/ })).toHaveAttribute(
      'href',
      '/chats/new?to=royaraqamia'
    );

    // The FAQ row is public: a guest gets a link, not the sign-in prompt.
    expect(screen.getByRole('link', { name: /الأسئلة الشَّائعة/ })).toHaveAttribute(
      'href',
      '/account/faq'
    );

    // The plans are public for a guest too, and the usage card is absent.
    expect(screen.getByRole('link', { name: /خطط التَّسعير/ })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByText('الاستهلاك')).not.toBeInTheDocument();

    // The legal pages stay published and indexed, but they are no longer rows
    // on this page (account rows are hidden; the sitemap still carries them).
    for (const label of ['سياسة الخصوصيَّة', 'شروط الاستخدام', 'سياسة الأمان']) {
      expect(screen.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument();
    }

    // The site footer itself belongs to the layout, outside `<main>`, and has
    // its own suite.
    expect(screen.queryByText('جميع الحقوق محفوظة')).not.toBeInTheDocument();

    // Gated rows are visible, but as buttons rather than links.
    for (const label of [
      'الطَّلبات',
      'المنشورات',
      'التَّطبيقات المتَّصلة بالـ MCP',
      'الأعضاء المحظورون',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument();
    }

    // The news and links rows left the page for their app's own FAB (ADR-0153);
    // their routes stay live, only the entry is gone.
    for (const label of ['مصادر الأخبار', 'الرَّوابط المختصَرة']) {
      expect(screen.queryByRole('button', { name: new RegExp(label) })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument();
    }

    expect(screen.queryByText('الإدارة')).not.toBeInTheDocument();
    expect(screen.queryByText('تسجيل الخروج')).not.toBeInTheDocument();
  });

  it('prompts guests to sign in and returns them to the row they picked', async () => {
    render(<AccountView />);

    fireEvent.click(screen.getByRole('button', { name: /التَّطبيقات المتَّصلة بالـ MCP/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /تسجيل الدُّخول/ });
    expect(cta).toHaveAttribute('href', '/auth/login?redirect=%2Faccount%2Fconnected-apps');

    // The prompt dismisses and the sign-in page is pushed. Done the other way
    // round the push lost to the history entry the dismissal released.
    fireEvent.click(cta);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/auth/login?redirect=%2Faccount%2Fconnected-apps')
    );
  });

  it('shows the profile and account rows for signed-in users', () => {
    mocks.session.user = { id: 'u1', email: 'user@example.com' };
    render(<AccountView />);

    expect(screen.getAllByText('user@example.com').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /الطَّلبات/ })).toHaveAttribute(
      'href',
      '/account/submissions'
    );
    expect(screen.getByRole('link', { name: /التَّطبيقات المتَّصلة بالـ MCP/ })).toHaveAttribute(
      'href',
      '/account/connected-apps'
    );
    expect(screen.getByRole('link', { name: /الأسئلة الشَّائعة/ })).toHaveAttribute(
      'href',
      '/account/faq'
    );
    expect(screen.getByRole('link', { name: /خطط التَّسعير/ })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: /الأعضاء المحظورون/ })).toHaveAttribute(
      'href',
      '/account/blocked'
    );
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeInTheDocument();
    expect(screen.queryByText('سجِّل الدُّخول إلى حسابك')).not.toBeInTheDocument();
  });

  it('ends the public links at تواصل معنا and then signs out', () => {
    mocks.session.user = { id: 'u1', email: 'user@example.com' };
    render(<AccountView />);

    const nav = screen.getByRole('navigation', { name: 'إجراءات الحساب' });
    const order = Array.from(nav.querySelectorAll('a, button')).map((element) =>
      Array.from(element.children)[0]?.textContent?.trim()
    );

    expect(order.slice(-2)).toEqual(['تواصل معنا', 'تسجيل الخروج']);
  });
});
