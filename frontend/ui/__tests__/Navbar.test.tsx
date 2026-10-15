import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navbar } from '../Navbar';
import { UIProvider } from '../../state/UIContext';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../shared/notification-dropdown', () => ({
  NotificationDropdown: () => null,
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
    expect(screen.getByRole('navigation', { name: 'القائمة الرئيسية' })).toBeInTheDocument();
  });

  it('renders the خدماتنا dropdown trigger and no mobile menu button', () => {
    renderWithProviders(<Navbar />);
    expect(screen.getAllByRole('button', { name: 'خدماتنا' }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('فتح القائمة')).not.toBeInTheDocument();
  });

  it('renders the logo and the notification control, without inline nav links', () => {
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('link', { name: /رؤيَة رقَميَّة/ })).toHaveAttribute('href', '#home');
    // The shell keeps one top bar at every width: account and section links live
    // in the floating `BottomTabBar`, not here.
    expect(screen.queryByRole('link', { name: 'الرَّئيسيَّة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'المجتمع' })).not.toBeInTheDocument();
  });
});
