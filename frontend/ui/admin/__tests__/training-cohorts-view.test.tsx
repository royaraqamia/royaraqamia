import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TrainingCohortsView } from '../training-cohorts-view';
import { TRAINING_COHORT_DEFAULT_CAPACITY, type TrainingCohort } from '@/shared/contracts/training';

const mocks = vi.hoisted(() => ({
  getTrainingCohorts: vi.fn(),
  createTrainingCohort: vi.fn(),
  updateTrainingCohort: vi.fn(),
}));

vi.mock('@/frontend/api/training', () => ({
  getTrainingCohorts: mocks.getTrainingCohorts,
  createTrainingCohort: mocks.createTrainingCohort,
  updateTrainingCohort: mocks.updateTrainingCohort,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COHORT: TrainingCohort = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  course_slug: 'build-digital-products',
  label: 'الدُّفعة الأولى — نوفمبر',
  starts_at: '2026-11-01T00:00:00.000Z',
  capacity: 10,
  seats_taken: 3,
  status: 'open',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  mocks.getTrainingCohorts.mockReset();
  mocks.createTrainingCohort.mockReset();
  mocks.updateTrainingCohort.mockReset();
  mocks.getTrainingCohorts.mockResolvedValue([COHORT]);
});

describe('TrainingCohortsView', () => {
  it('lists the cohorts with their seats', async () => {
    render(<TrainingCohortsView />);

    expect(await screen.findByText(COHORT.label)).toBeInTheDocument();
    expect(screen.getByText('3/10 مشغولة · 7 متبقٍّ')).toBeInTheDocument();
  });

  it('shows the empty state when no cohorts exist', async () => {
    mocks.getTrainingCohorts.mockResolvedValue([]);

    render(<TrainingCohortsView />);

    expect(await screen.findByText('لا توجد دُفعات بعد')).toBeInTheDocument();
  });

  it('creates a cohort from the form with the default course and status', async () => {
    mocks.createTrainingCohort.mockResolvedValue({ success: true, data: COHORT });

    render(<TrainingCohortsView />);
    await screen.findByText(COHORT.label);

    fireEvent.click(screen.getByRole('button', { name: /دُفعة جديدة/ }));
    fireEvent.change(screen.getByLabelText(/عنوان/), {
      target: { value: 'الدُّفعة الثَّانية — ديسمبر' },
    });
    fireEvent.change(screen.getByLabelText(/تاريخ البدء/), {
      target: { value: '2026-12-01' },
    });
    fireEvent.change(screen.getByLabelText(/عدد المقاعد/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /إضافة الدُّفعة/ }));

    await waitFor(() =>
      expect(mocks.createTrainingCohort).toHaveBeenCalledWith({
        course_slug: 'build-digital-products',
        label: 'الدُّفعة الثَّانية — ديسمبر',
        starts_at: '2026-12-01',
        capacity: 12,
        status: 'open',
      })
    );
  });

  it('blocks submission and reports field errors for an empty form', async () => {
    render(<TrainingCohortsView />);
    await screen.findByText(COHORT.label);

    fireEvent.click(screen.getByRole('button', { name: /دُفعة جديدة/ }));
    fireEvent.click(screen.getByRole('button', { name: /إضافة الدُّفعة/ }));

    expect(await screen.findByText('تاريخ البدء مطلوب')).toBeInTheDocument();
    expect(screen.getByText('العنوان يجب أن يكون حرفين على الأقل')).toBeInTheDocument();
    expect(mocks.createTrainingCohort).not.toHaveBeenCalled();
  });

  it('toggles a cohort between open and closed', async () => {
    mocks.updateTrainingCohort.mockResolvedValue({ success: true, data: COHORT });

    render(<TrainingCohortsView />);
    await screen.findByText(COHORT.label);

    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));

    await waitFor(() =>
      expect(mocks.updateTrainingCohort).toHaveBeenCalledWith(COHORT.id, { status: 'closed' })
    );
  });

  it('defaults a new cohort to the default capacity', async () => {
    render(<TrainingCohortsView />);
    await screen.findByText(COHORT.label);

    fireEvent.click(screen.getByRole('button', { name: /دُفعة جديدة/ }));

    expect(screen.getByLabelText(/عدد المقاعد/)).toHaveValue(TRAINING_COHORT_DEFAULT_CAPACITY);
  });
});
