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
    expect(screen.queryByText('إغلاق')).not.toBeInTheDocument();
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

  it('draws the marketplace under the nine, as a link rather than a toggle', async () => {
    render(<NavDropdown link={SERVICES_LINK} isActive={false} />);

    fireEvent.click(screen.getByRole('button', { name: SERVICES_LINK.label }));

    const marketplace = await screen.findByRole(
      'link',
      { name: /متجر التطبيقات/ },
      { timeout: 3000 }
    );

    expect(marketplace).toHaveAttribute('href', '/mcp/apps');
    // A door to someone else's apps is never a homepage app (ADR-0155).
    expect(screen.getByText('تطبيقات خارجية')).toBeInTheDocument();

    // The sheet closes on the tap, and the navigation still happens: closing
    // first is what used to cancel it.
    fireEvent.click(marketplace);
    expect(mockPush).toHaveBeenCalledWith('/mcp/apps');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
