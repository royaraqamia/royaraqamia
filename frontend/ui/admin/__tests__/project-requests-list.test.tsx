import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectRequestsList } from '../project-requests-list';
import type { ProjectRequest } from '@/shared/contracts/project-requests';

function makeRequest(overrides: Partial<ProjectRequest> = {}): ProjectRequest {
  return {
    id: 'req-1',
    full_name: 'أحمد العلي',
    phone_whatsapp: '+963 968 478 904',
    email: null,
    project_type: 'website',
    description: 'أريد متجرًا إلكترونيًّا.',
    budget_range: null,
    timeline: null,
    existing_url: null,
    reference_code: 'PRJ-2026-A7K2M9QX',
    status: 'new',
    notes: null,
    user_id: null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

function renderList(requests: ProjectRequest[], onSave = vi.fn()) {
  render(
    <ProjectRequestsList requests={requests} loading={false} savingId={null} onSave={onSave} />
  );
  return { onSave };
}

describe('ProjectRequestsList', () => {
  it('announces itself busy while loading', () => {
    render(<ProjectRequestsList requests={[]} loading savingId={null} onSave={vi.fn()} />);

    expect(screen.getByLabelText('جارٍ تحميل الطلبات')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the empty state when there are no requests', () => {
    renderList([]);

    expect(screen.getByText('لا توجد طلبات بعد')).toBeInTheDocument();
  });

  it('renders the client name and reference code for each request', () => {
    renderList([makeRequest()]);

    expect(screen.getByRole('heading', { level: 2, name: 'أحمد العلي' })).toBeInTheDocument();
    expect(screen.getByText('PRJ-2026-A7K2M9QX')).toBeInTheDocument();
  });

  it('opens WhatsApp from the row with a digits-only number, quoting the reference code', () => {
    renderList([makeRequest()]);

    const link = screen.getByRole('link', { name: /968 478 904/ });
    const href = link.getAttribute('href') ?? '';

    expect(href.startsWith('https://wa.me/963968478904?text=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('PRJ-2026-A7K2M9QX');
  });

  it('renders a chosen budget and timeline as their labels', () => {
    renderList([makeRequest({ budget_range: '300-600', timeline: 'flexible' })]);

    expect(screen.getByText(/300\$ – 600\$/)).toBeInTheDocument();
    expect(screen.getByText(/مرن/)).toBeInTheDocument();
  });

  it('falls back to the stored value for a bracket it does not recognise', () => {
    renderList([makeRequest({ budget_range: 'custom-range' })]);

    expect(screen.getByText('custom-range')).toBeInTheDocument();
  });

  it('reveals the save button only once the notes are dirty and saves them trimmed', () => {
    const { onSave } = renderList([makeRequest()]);

    expect(screen.queryByRole('button', { name: 'حفظ الملاحظات' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('ملاحظات المتابعة'), {
      target: { value: '  تمَّ التَّواصل  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الملاحظات' }));

    expect(onSave).toHaveBeenCalledWith('req-1', { status: 'new', notes: 'تمَّ التَّواصل' });
  });

  it('does not offer a save button when the notes are unchanged', () => {
    renderList([makeRequest({ notes: 'مكتمل' })]);

    expect(screen.queryByRole('button', { name: 'حفظ الملاحظات' })).not.toBeInTheDocument();
  });
});
