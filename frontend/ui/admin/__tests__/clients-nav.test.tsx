import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { ClientsNav } from '../clients-nav';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

const mockedUsePathname = vi.mocked(usePathname);

const SECTIONS = [
  { href: '/admin/clients/project-requests', label: 'طلبات المشاريع' },
  { href: '/admin/clients/retainers', label: 'العقود الشَّهريَّة' },
];

describe('ClientsNav', () => {
  beforeEach(() => {
    mockedUsePathname.mockReturnValue('/admin/clients/project-requests');
  });

  it('has an accessible navigation landmark', () => {
    render(<ClientsNav />);

    expect(screen.getByRole('navigation', { name: 'أقسام العملاء' })).toBeInTheDocument();
  });

  it('renders both client sections as links', () => {
    render(<ClientsNav />);

    for (const section of SECTIONS) {
      expect(screen.getByRole('link', { name: section.label })).toHaveAttribute(
        'href',
        section.href
      );
    }
  });

  it('marks only the current section with aria-current', () => {
    mockedUsePathname.mockReturnValue('/admin/clients/retainers');
    render(<ClientsNav />);

    expect(screen.getByRole('link', { name: 'العقود الشَّهريَّة' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'طلبات المشاريع' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('treats nested routes as active for their section', () => {
    mockedUsePathname.mockReturnValue('/admin/clients/retainers/ret-1');
    render(<ClientsNav />);

    expect(screen.getByRole('link', { name: 'العقود الشَّهريَّة' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
