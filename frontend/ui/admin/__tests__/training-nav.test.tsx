import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { TrainingNav } from '../training-nav';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

const mockedUsePathname = vi.mocked(usePathname);

const SECTIONS = [
  { href: '/admin/training/cohorts', label: 'الدُّفعات' },
  { href: '/admin/training/applications', label: 'طلبات الالتحاق' },
];

describe('TrainingNav', () => {
  beforeEach(() => {
    mockedUsePathname.mockReturnValue('/admin/training/cohorts');
  });

  it('has an accessible navigation landmark', () => {
    render(<TrainingNav />);

    expect(screen.getByRole('navigation', { name: 'أقسام إدارة التَّدريب' })).toBeInTheDocument();
  });

  it('renders every training section as a link', () => {
    render(<TrainingNav />);

    for (const section of SECTIONS) {
      expect(screen.getByRole('link', { name: section.label })).toHaveAttribute(
        'href',
        section.href
      );
    }
  });

  it('marks only the current section with aria-current', () => {
    mockedUsePathname.mockReturnValue('/admin/training/applications');
    render(<TrainingNav />);

    expect(screen.getByRole('link', { name: 'طلبات الالتحاق' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'الدُّفعات' })).not.toHaveAttribute('aria-current');
  });

  it('treats nested routes as active for their section', () => {
    mockedUsePathname.mockReturnValue('/admin/training/cohorts/new');
    render(<TrainingNav />);

    expect(screen.getByRole('link', { name: 'الدُّفعات' })).toHaveAttribute('aria-current', 'page');
  });
});
