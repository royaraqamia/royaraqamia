import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePageContent } from '../HomePageContent';
import { UIProvider } from '../../context/UIContext';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

describe('HomePageContent', () => {
  it('renders the main landmark', () => {
    renderWithProviders(<HomePageContent />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders Hero section', () => {
    renderWithProviders(<HomePageContent />);
    expect(screen.getByText('شريكك الاستراتيجي')).toBeInTheDocument();
  });
});
