import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShieldCheck } from 'lucide-react';
import { AdminPageHeader } from '../admin-page-header';

describe('AdminPageHeader', () => {
  it('renders the title as a level-1 heading alongside the description', () => {
    render(
      <AdminPageHeader
        icon={ShieldCheck}
        title="إدارة الشَّهادات"
        description="إصدار وتعديل وحذف شهادات الطُّلاب"
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'إدارة الشَّهادات' })).toBeInTheDocument();
    expect(screen.getByText('إصدار وتعديل وحذف شهادات الطُّلاب')).toBeInTheDocument();
  });

  it('omits the description when none is provided', () => {
    const { container } = render(<AdminPageHeader icon={ShieldCheck} title="الإدارة" />);

    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('hides the decorative icon from assistive technology', () => {
    const { container } = render(<AdminPageHeader icon={ShieldCheck} title="الإدارة" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the action and children slots', () => {
    render(
      <AdminPageHeader
        icon={ShieldCheck}
        title="الإدارة"
        action={<button type="button">شهادة جديدة</button>}
      >
        <nav aria-label="أقسام الإدارة">تنقّل</nav>
      </AdminPageHeader>
    );

    expect(screen.getByRole('button', { name: 'شهادة جديدة' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'أقسام الإدارة' })).toBeInTheDocument();
  });
});
