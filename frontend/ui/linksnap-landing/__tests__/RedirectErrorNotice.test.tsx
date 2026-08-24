import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RedirectErrorNotice } from '../RedirectErrorNotice';

function goto(path: string) {
  window.history.pushState({}, '', path);
}

describe('RedirectErrorNotice', () => {
  beforeEach(() => {
    goto('/linksnap');
  });

  afterEach(() => {
    cleanup();
    goto('/');
  });

  it('renders nothing when no error params are present', () => {
    render(<RedirectErrorNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the blocked message and strips the query from the URL', async () => {
    goto('/linksnap?error=blocked&code=abc123');
    render(<RedirectErrorNotice />);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('فشل إعادة التوجيه');
    expect(banner).toHaveTextContent(/abc123/);
    expect(banner).toHaveTextContent('تم إلغاء تنشيطه');
    expect(window.location.search).toBe('');
  });

  it('shows the expired message', async () => {
    goto('/linksnap?error=expired&code=xyz789');
    render(<RedirectErrorNotice />);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('انتهت صلاحية');
    expect(banner).toHaveTextContent(/xyz789/);
  });

  it('shows the not-found message for unknown codes', async () => {
    goto('/linksnap?error=not-found&code=missing');
    render(<RedirectErrorNotice />);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('غير موجود');
    expect(banner).toHaveTextContent(/missing/);
  });

  it('ignores unrecognized error kinds', () => {
    goto('/linksnap?error=something_else&code=abc123');
    render(<RedirectErrorNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
