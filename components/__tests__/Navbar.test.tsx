import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navbar } from '../Navbar';
import { UIProvider } from '../../context/UIContext';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

describe('Navbar', () => {
  it('renders the skip-to-content link', () => {
    renderWithProviders(<Navbar />);
    const skipLink = screen.getByText('تخطي إلى المحتوى الرئيسي');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('renders the navigation landmark', () => {
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders the mobile menu button', () => {
    renderWithProviders(<Navbar />);
    const menuButton = screen.getByLabelText('فتح القائمة');
    expect(menuButton).toBeInTheDocument();
  });

  it('renders the main nav link', () => {
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('link', { name: 'الرَّئيسيَّة' })).toBeInTheDocument();
  });
});
