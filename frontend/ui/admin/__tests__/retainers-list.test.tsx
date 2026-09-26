import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildRetainerDetailsEdit, RetainersList } from '../retainers-list';
import type { Retainer } from '@/shared/contracts/retainers';

function makeRetainer(overrides: Partial<Retainer> = {}): Retainer {
  return {
    id: 'ret-1',
    full_name: 'أحمد العلي',
    phone_whatsapp: '+963 968 478 904',
    email: null,
    company: 'شركة النُّور للتجارة',
    current_projects: 'متجر إلكترونيّ على ووردبريس، وموقع تعريفيّ لشركة صغيرة.',
    needs: 'صيانة دوريَّة، إصلاح الأعطال، وإضافة ميزات جديدة كلَّ شهر.',
    preferred_start: null,
    monthly_fee_usd: 100,
    paid_through: null,
    reference_code: 'RET-2026-A7K2M9QX',
    status: 'new',
    notes: null,
    user_id: null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

function renderList(retainers: Retainer[], onSave = vi.fn()) {
  render(<RetainersList retainers={retainers} loading={false} savingId={null} onSave={onSave} />);
  return { onSave };
}

describe('RetainersList', () => {
  it('announces itself busy while loading', () => {
    render(<RetainersList retainers={[]} loading savingId={null} onSave={vi.fn()} />);

    expect(screen.getByLabelText('جاري تحميل العقود')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the empty state when there are no retainers', () => {
    renderList([]);

    expect(screen.getByText('لا توجد عقود بعد')).toBeInTheDocument();
  });

  it('renders the client name, company and reference code for each retainer', () => {
    renderList([makeRetainer()]);

    expect(screen.getByRole('heading', { level: 2, name: 'أحمد العلي' })).toBeInTheDocument();
    expect(screen.getByText('RET-2026-A7K2M9QX')).toBeInTheDocument();
    expect(screen.getByText('شركة النُّور للتجارة')).toBeInTheDocument();
  });

  it('opens WhatsApp from the row with a digits-only number, quoting the reference code', () => {
    renderList([makeRetainer()]);

    const link = screen.getByRole('link', { name: /968 478 904/ });
    const href = link.getAttribute('href') ?? '';

    expect(href.startsWith('https://wa.me/963968478904?text=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('RET-2026-A7K2M9QX');
  });

  it('shows the agreed terms in editable fields', () => {
    renderList([makeRetainer({ monthly_fee_usd: 250, paid_through: '2026-10-01' })]);

    expect(screen.getByLabelText('الرَّسم الشَّهري (دولار)')).toHaveValue(250);
    expect(screen.getByLabelText('مدفوع حتى')).toHaveValue('2026-10-01');
  });

  it('says the paid-through date is unrecorded rather than showing an empty promise', () => {
    renderList([makeRetainer({ paid_through: null })]);

    expect(screen.getByText('لم يُسجَّل بعد')).toBeInTheDocument();
  });

  it('marks a paid-through date that is already behind today', () => {
    renderList([makeRetainer({ paid_through: '2020-01-01' })]);

    expect(screen.getByText('انتهت المُدَّة')).toBeInTheDocument();
  });

  it('leaves a paid-through date that is still ahead unmarked', () => {
    renderList([makeRetainer({ paid_through: '2099-01-01' })]);

    expect(screen.queryByText('انتهت المُدَّة')).not.toBeInTheDocument();
  });

  it('does not offer a save button when nothing has changed', () => {
    renderList([makeRetainer()]);

    expect(screen.queryByRole('button', { name: 'حفظ التَّفاصيل' })).not.toBeInTheDocument();
  });

  it('sends only the notes when only the notes change', () => {
    const { onSave } = renderList([
      makeRetainer({ monthly_fee_usd: 250, paid_through: '2026-10-01' }),
    ]);

    fireEvent.change(screen.getByLabelText('ملاحظات المتابعة'), {
      target: { value: '  تمَّ التَّواصل  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التَّفاصيل' }));

    expect(onSave).toHaveBeenCalledWith('ret-1', { notes: 'تمَّ التَّواصل' });
  });

  it('sends only the fee when only the fee changes, so the terms cannot be reverted', () => {
    const { onSave } = renderList([makeRetainer({ monthly_fee_usd: 100 })]);

    fireEvent.change(screen.getByLabelText('الرَّسم الشَّهري (دولار)'), {
      target: { value: '375' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التَّفاصيل' }));

    expect(onSave).toHaveBeenCalledWith('ret-1', { monthly_fee_usd: 375 });
  });

  it('clears the paid-through date when the field is emptied', () => {
    const { onSave } = renderList([makeRetainer({ paid_through: '2026-10-01' })]);

    fireEvent.change(screen.getByLabelText('مدفوع حتى'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التَّفاصيل' }));

    expect(onSave).toHaveBeenCalledWith('ret-1', { paid_through: null });
  });

  it('refuses to save a fee that is not an amount above zero, in the API\u2019s own words', () => {
    const { onSave } = renderList([makeRetainer({ monthly_fee_usd: 100 })]);

    fireEvent.change(screen.getByLabelText('الرَّسم الشَّهري (دولار)'), { target: { value: '' } });

    expect(screen.getByText('الرَّسم الشَّهري يجب أن يكون أكبر من صفر')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'حفظ التَّفاصيل' });
    expect(save).toBeDisabled();

    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a fee with sub-cent precision that the column would round away', () => {
    renderList([makeRetainer({ monthly_fee_usd: 100 })]);

    fireEvent.change(screen.getByLabelText('الرَّسم الشَّهري (دولار)'), {
      target: { value: '100.999' },
    });

    expect(
      screen.getByText('الرَّسم الشَّهري لا يقبل أكثر من منزلتين عشريّتين')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ التَّفاصيل' })).toBeDisabled();
  });
});

describe('buildRetainerDetailsEdit', () => {
  const retainer = makeRetainer({
    notes: 'قديم',
    monthly_fee_usd: 250,
    paid_through: '2026-10-01',
  });
  const cleanDraft = { notes: 'قديم', fee: '250', paidThrough: '2026-10-01' };

  it('carries nothing and reports clean when the draft matches the row', () => {
    const result = buildRetainerDetailsEdit(retainer, cleanDraft);

    expect(result.edit).toEqual({});
    expect(result.dirty).toBe(false);
    expect(result.feeError).toBeNull();
  });

  it('carries only the notes when only the notes changed', () => {
    const result = buildRetainerDetailsEdit(retainer, { ...cleanDraft, notes: 'جديد' });

    expect(result.edit).toEqual({ notes: 'جديد' });
    expect(result.dirty).toBe(true);
  });

  it('carries only the fee when only the fee changed', () => {
    const result = buildRetainerDetailsEdit(retainer, { ...cleanDraft, fee: '275' });

    expect(result.edit).toEqual({ monthly_fee_usd: 275 });
  });

  it('carries a cleared date as null rather than dropping it', () => {
    const result = buildRetainerDetailsEdit(retainer, { ...cleanDraft, paidThrough: '' });

    expect(result.edit).toEqual({ paid_through: null });
  });

  it('never invents a fee from a blank or hostile value', () => {
    for (const fee of ['', '   ', 'صفر', '-5', '0']) {
      const result = buildRetainerDetailsEdit(retainer, { ...cleanDraft, fee });

      expect(result.edit.monthly_fee_usd).toBeUndefined();
      expect(result.feeError).not.toBeNull();
    }
  });

  it('reports the schema message for a fee past what the column can hold', () => {
    const result = buildRetainerDetailsEdit(retainer, { ...cleanDraft, fee: '100000000' });

    expect(result.feeError).toContain('كبير');
  });
});
