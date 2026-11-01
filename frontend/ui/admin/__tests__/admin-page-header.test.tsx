import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPageHeader } from '../admin-page-header';

describe('AdminPageHeader', () => {
  it('renders the title as a centred level-1 heading, and no subtitle', () => {
    const { container } = render(<AdminPageHeader title="إدارة الشَّهادات" />);

    expect(screen.getByRole('heading', { level: 1, name: 'إدارة الشَّهادات' })).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(container.querySelector('header')).toHaveClass('text-center');
  });

  it('draws no icon', () => {
    const { container } = render(<AdminPageHeader title="الإدارة" />);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the action and children slots', () => {
    render(
      <AdminPageHeader title="الإدارة" action={<button type="button">شهادة جديدة</button>}>
        <nav aria-label="أقسام الإدارة">تنقّل</nav>
      </AdminPageHeader>
    );

    expect(screen.getByRole('button', { name: 'شهادة جديدة' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'أقسام الإدارة' })).toBeInTheDocument();
  });
});
