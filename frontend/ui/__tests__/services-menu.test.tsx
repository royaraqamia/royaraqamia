import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { NavDropdown } from '../navbar/NavDropdown';
import { ServicesMenu } from '../navbar/ServicesMenu';
import { SERVICES_LINK } from '../navbar/services-link';

afterEach(() => {
  cleanup();
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
});
