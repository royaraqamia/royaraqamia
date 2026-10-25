import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { NavDropdown } from '../navbar/NavDropdown';
import { ServicesMenu } from '../navbar/ServicesMenu';
import { SERVICES_LINK } from '../navbar/services-link';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServicesMenu (hero CTA)', () => {
  it('opens the services bottom sheet', async () => {
    render(<ServicesMenu trigger={<button type="button">تصفَّح خدماتنا</button>} />);

    fireEvent.click(screen.getByRole('button', { name: 'تصفَّح خدماتنا' }));

    // The sheet is a lazy chunk now, so the first open resolves an import too.
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('طلب بناء مشروع')).toBeInTheDocument();
    // The bottom sheet no longer renders a header or its own close control.
    expect(screen.queryByText('إغلاق')).not.toBeInTheDocument();
  });
});

describe('NavDropdown (navbar services menu)', () => {
  it('opens the services bottom sheet at every width', async () => {
    render(<NavDropdown link={SERVICES_LINK} isActive={false} handleHashClick={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: SERVICES_LINK.label }));

    // The sheet is a lazy chunk now, so the first open resolves an import too.
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('طلب بناء مشروع')).toBeInTheDocument();
  });
});
