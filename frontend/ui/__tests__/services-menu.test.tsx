import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { NavDropdown } from '../navbar/NavDropdown';
import { ServicesMenu } from '../navbar/ServicesMenu';
import { SERVICES_LINK } from '../navbar/services-link';

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  vi.restoreAllMocks();
});

describe('ServicesMenu (homepage add control)', () => {
  it('opens the app picker', async () => {
    render(<ServicesMenu trigger={<button type="button">أضِف تطبيقًا</button>} />);

    fireEvent.click(screen.getByRole('button', { name: 'أضِف تطبيقًا' }));

    // The sheet is a lazy chunk now, so the first open resolves an import too.
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('أخبار اليوم')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'إضافة' }).length).toBeGreaterThan(0);
    // The full-height sheet needs a visible way out as well as the overlay.
    expect(screen.getByRole('button', { name: 'إغلاق' })).toBeInTheDocument();
  });
});

describe('NavDropdown (navbar app picker)', () => {
  it('opens the app picker at every width', async () => {
    render(<NavDropdown link={SERVICES_LINK} isActive={false} />);

    fireEvent.click(screen.getByRole('button', { name: SERVICES_LINK.label }));

    // The sheet is a lazy chunk now, so the first open resolves an import too.
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('أخبار اليوم')).toBeInTheDocument();
  });

  it('carries the marketplace and the connected clients as tabs', async () => {
    render(<NavDropdown link={SERVICES_LINK} isActive={false} />);

    fireEvent.click(screen.getByRole('button', { name: SERVICES_LINK.label }));
    await screen.findByRole('dialog', {}, { timeout: 3000 });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'تطبيقاتنا',
      'تطبيقات خارجيَّة',
      'الـ MCP الخاص بنا',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    // The marketplace is a tab now, not a row that leaves the sheet.
    const externalTab = tabs[1];
    if (!externalTab) throw new Error('the external tab is missing');
    fireEvent.click(externalTab);
    expect(await screen.findByPlaceholderText('ابحث باسم التطبيق أو وصفه...')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'تطبيقات خارجيَّة' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });
});
