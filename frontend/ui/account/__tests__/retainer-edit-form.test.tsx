import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { Retainer } from '@/shared/contracts/retainers';

const mockUpdateMyRetainer = vi.fn();

vi.mock('@/frontend/api/retainers', () => ({
  updateMyRetainer: (...args: unknown[]) => mockUpdateMyRetainer(...args),
}));

import { RetainerEditForm } from '../retainer-edit-form';

// The regression: a retainer whose start date was recorded before today.
const PAST_START = '1990-01-01';
const UPDATED_NEEDS = 'احتياجات محدَّثة شهريًّا، مع صيانة دوريَّة وإصلاح الأعطال.';

const RETAINER: Retainer = {
  id: 'ret-1',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  email: 'ahmad@example.com',
  company: 'شركة النُّور للتجارة',
  current_projects: 'متجر إلكترونيّ على ووردبريس، وموقع تعريفيّ لشركة صغيرة.',
  needs: 'صيانة دوريَّة، إصلاح الأعطال، وإضافة ميزات جديدة كلَّ شهر.',
  preferred_start: PAST_START,
  monthly_fee_usd: 150,
  paid_through: null,
  reference_code: 'RET-2026-A7K2M9QX',
  status: 'new',
  notes: null,
  user_id: 'user-9',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  edited_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RetainerEditForm', () => {
  it('saves an edit without moving a stored start that has already passed', async () => {
    mockUpdateMyRetainer.mockResolvedValue({
      success: true,
      data: { ...RETAINER, needs: UPDATED_NEEDS },
    });

    render(<RetainerEditForm retainer={RETAINER} onSaved={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/ما تحتاج صيانته أو تطويره/), {
      target: { value: UPDATED_NEEDS },
    });
    fireEvent.click(screen.getByRole('button', { name: /حفظ التَّعديلات/ }));

    await waitFor(() => expect(mockUpdateMyRetainer).toHaveBeenCalledTimes(1));
    expect(mockUpdateMyRetainer).toHaveBeenCalledWith(
      'ret-1',
      expect.objectContaining({ needs: UPDATED_NEEDS, preferred_start: PAST_START })
    );
  });
});
