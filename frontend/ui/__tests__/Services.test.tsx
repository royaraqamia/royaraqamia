import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Services } from '../Services';
import { UIProvider } from '../../state/UIContext';
import { SERVICES_LINK } from '../navbar/services-link';

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

/** The app rows the `تطبيقاتنا` sheet ships, in its own order. */
const MENU_ENTRIES = (SERVICES_LINK.subItems ?? []).map((item) => [item.label, item.href] as const);

describe('Services', () => {
  it('renders the section heading', () => {
    renderWithProviders(<Services />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/ماذا/);
    expect(heading).toHaveTextContent(/نُقدِّم/);
  });

  it('lists every app from the تطبيقاتنا menu as its own link', () => {
    renderWithProviders(<Services />);

    for (const [name, href] of MENU_ENTRIES) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(MENU_ENTRIES.length);
  });

  it('shows no feature list and no separate CTA button', () => {
    renderWithProviders(<Services />);

    expect(screen.queryByText('قراءة المزيد')).not.toBeInTheDocument();
    expect(screen.queryByText('بناء متكامل من الألف إلى الياء')).not.toBeInTheDocument();
  });
});
