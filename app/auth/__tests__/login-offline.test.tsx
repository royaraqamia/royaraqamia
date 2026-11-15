import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ login: vi.fn(), signInWithGoogle: vi.fn() }));

vi.mock('@/frontend/api/auth', () => mocks);
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/frontend/ui/shared/turnstile', () => ({ Turnstile: () => null }));

import LoginPage from '../login/page';

/**
 * #368: the login form names the connection at the point of failure instead of
 * showing a failed sign-in in the same banner as a wrong password.
 *
 * #1500: the email form is the second door on the page — Google is the first —
 * so every case here opens it before submitting.
 */
describe('LoginPage offline submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openEmailForm() {
    const { container } = render(<LoginPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'الدُّخول بالبريد الإلكتروني' }));
    // The form's own submit is what proves the second door actually opened.
    await screen.findByRole('button', { name: 'تسجيل الدُّخول' });
    return container;
  }

  it('shows the needs-connection state, not a credential error', async () => {
    mocks.login.mockResolvedValue({
      ok: false,
      offline: true,
      message: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.',
    });

    const container = await openEmailForm();
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

    const container = await openEmailForm();
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('بيانات الدُّخول غير صحيحة.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
