import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { ConsultationNav } from '../consultation-nav';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

const mockedUsePathname = vi.mocked(usePathname);

const SECTIONS = [
  { href: '/admin/consultations/bookings', label: 'الحجوزات' },
  { href: '/admin/consultations/availability', label: 'المواعيد' },
  { href: '/admin/consultations/packages', label: 'الباقات' },
  { href: '/admin/consultations/settings', label: 'الإعدادات' },
];

describe('ConsultationNav', () => {
  beforeEach(() => {
    mockedUsePathname.mockReturnValue('/admin/consultations/bookings');
  });

  it('has an accessible navigation landmark', () => {
    render(<ConsultationNav />);

    expect(screen.getByRole('navigation', { name: 'أقسام إدارة الاستشارات' })).toBeInTheDocument();
  });

  it('renders every consultation section as a link', () => {
    render(<ConsultationNav />);

    for (const section of SECTIONS) {
      expect(screen.getByRole('link', { name: section.label })).toHaveAttribute(
        'href',
        section.href
      );
    }
  });

  it('marks only the current section with aria-current', () => {
    mockedUsePathname.mockReturnValue('/admin/consultations/packages');
    render(<ConsultationNav />);

    expect(screen.getByRole('link', { name: 'الباقات' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'الحجوزات' })).not.toHaveAttribute('aria-current');
  });

  it('treats nested routes as active for their section', () => {
    mockedUsePathname.mockReturnValue('/admin/consultations/settings/advanced');
    render(<ConsultationNav />);

    expect(screen.getByRole('link', { name: 'الإعدادات' })).toHaveAttribute('aria-current', 'page');
  });
});
