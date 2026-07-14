import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WhatsAppFloat } from '../WhatsAppFloat';
import { UIProvider } from '../../context/UIContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

describe('WhatsAppFloat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
