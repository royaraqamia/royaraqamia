import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ login: vi.fn(), signInWithGoogle: vi.fn() }));

vi.mock('@/frontend/api/auth', () => mocks);
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/frontend/ui/shared/turnstile', () => ({ Turnstile: () => null }));

import LoginPage from '../login/page';

// #368: the login form names the connection at the point of failure instead of
// showing a failed sign-in in the same banner as a wrong password.
describe('LoginPage offline submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the needs-connection state, not a credential error', async () => {
    mocks.login.mockResolvedValue({
      ok: false,
      offline: true,
      message: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.',
    });

    const { container } = render(<LoginPage />);
    await screen.findByRole('button', { name: 'تسجيل الدُّخول' });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    const state = await screen.findByRole('status');
    expect(state).toHaveTextContent('يتطلَّب الاتصال بالإنترنت');
    expect(state).toHaveTextContent('لم يصل طلب تسجيل الدُّخول إلى الخادم');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a server-answered failure as the ordinary error', async () => {
    mocks.login.mockResolvedValue({
      ok: false,
      offline: false,
      message: 'بيانات الدُّخول غير صحيحة.',
    });

    const { container } = render(<LoginPage />);
    await screen.findByRole('button', { name: 'تسجيل الدُّخول' });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('بيانات الدُّخول غير صحيحة.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
