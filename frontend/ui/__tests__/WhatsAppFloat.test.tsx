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

  it('renders the WhatsApp link after delay', () => {
    renderWithProviders(<WhatsAppFloat />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const link = screen.getByLabelText('تواصل معنا عبر واتساب');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides on product workspace routes', () => {
    mockUsePathname.mockReturnValue('/habitflow/app');
    renderWithProviders(<WhatsAppFloat />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByLabelText('تواصل معنا عبر واتساب')).not.toBeInTheDocument();
  });

  it.each(['/verify', '/verify/CERT-123', '/consultation/book'])('hides on %s', (pathname) => {
    mockUsePathname.mockReturnValue(pathname);
    renderWithProviders(<WhatsAppFloat />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByLabelText('تواصل معنا عبر واتساب')).not.toBeInTheDocument();
  });
});
