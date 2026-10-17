import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navbar } from '../Navbar';
import { UIProvider } from '../../state/UIContext';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../shared/notification-dropdown', () => ({
  NotificationDropdown: () => null,
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

describe('Navbar', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
  });

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

  it('renders nothing outside the primary routes', () => {
    mockPathname.mockReturnValue('/community/some-post');

    renderWithProviders(<Navbar />);

    expect(screen.queryByRole('navigation', { name: 'القائمة الرئيسية' })).not.toBeInTheDocument();
    expect(screen.queryByText('تخطي إلى المحتوى الرئيسي')).not.toBeInTheDocument();
  });

  it('reserves the fixed bar its flow space when the shell asks for it', () => {
    const { container } = renderWithProviders(<Navbar reserveSpace />);

    expect(container.querySelector('[data-navbar-spacer]')).not.toBeNull();
  });

  it('reserves nothing by default, so content can sit under the bar', () => {
    const { container } = renderWithProviders(<Navbar />);

    expect(container.querySelector('[data-navbar-spacer]')).toBeNull();
  });

  it('reserves nothing on a secondary route even when asked', () => {
    mockPathname.mockReturnValue('/community/some-post');

    const { container } = renderWithProviders(<Navbar reserveSpace />);

    expect(container.querySelector('[data-navbar-spacer]')).toBeNull();
  });
});
