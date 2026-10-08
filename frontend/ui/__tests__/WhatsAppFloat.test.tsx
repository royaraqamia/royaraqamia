import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WhatsAppFloat } from '../WhatsAppFloat';
import { UIProvider } from '../../state/UIContext';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from 'next/navigation';
const mockUsePathname = vi.mocked(usePathname);

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

describe('WhatsAppFloat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUsePathname.mockReturnValue('/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the WhatsApp link on homepage after delay', () => {
    renderWithProviders(<WhatsAppFloat />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const link = screen.getByLabelText('تواصل معنا عبر واتساب');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    '/habitflow/app',
    '/verify',
    '/verify/CERT-123',
    '/consultation/book',
    '/training/apply',
    '/request-project',
    '/hire',
    '/auth/login',
    '/auth/signup',
    '/auth/reset-password',
    '/auth/update-password',
    '/auth/verify-otp',
    '/auth/error',
    '/community',
    '/community/my-post',
    '/account/submissions',
    '/rates',
    '/privacy',
    '/terms',
    '/security',
    '/downloader',
    '/blogpress',
    '/blogpress/app',
    '/spendtrack',
    '/habitflow',
    '/linksnap',
    '/linksnap/unlock/CODE',
    '/offline',
    '/app-info',
    '/mcp/connect',
  ])('hides on %s', (pathname) => {
    mockUsePathname.mockReturnValue(pathname);
    renderWithProviders(<WhatsAppFloat />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByLabelText('تواصل معنا عبر واتساب')).not.toBeInTheDocument();
  });
});
