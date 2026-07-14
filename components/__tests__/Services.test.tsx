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

  it('renders both tab buttons', () => {
    renderWithProviders(<Services />);
    expect(screen.getByText('للتُّجَّار ومقدِّمي الخدمات')).toBeInTheDocument();
    expect(screen.getByText('للطُّلاب والخرِّيجين الجدد')).toBeInTheDocument();
  });

  it('renders merchant services by default', () => {
    renderWithProviders(<Services />);
    const headings = screen.getAllByText('بناء مواقع إلكترونيَّة وتطبيقات');
    expect(headings.length).toBe(2);
  });
});
