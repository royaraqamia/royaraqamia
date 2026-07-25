import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Services } from '../Services';
import { UIProvider } from '../../context/UIContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

describe('Services', () => {
  it('renders the section heading', () => {
    renderWithProviders(<Services />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/ماذا/);
    expect(heading).toHaveTextContent(/نقدِّم/);
  });

  it('renders all service cards', () => {
    renderWithProviders(<Services />);
    expect(screen.getAllByText('التَّدريب').length).toBeGreaterThan(0);
    expect(screen.getAllByText('الاستشارات').length).toBeGreaterThan(0);
    expect(screen.getAllByText('بناء مواقع إلكترونيَّة وتطبيقات').length).toBeGreaterThan(0);
  });
});
