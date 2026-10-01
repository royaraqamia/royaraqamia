import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TrainingApplicationWizard } from '../training-application-wizard';

const { submitTrainingApplication, getOpenTrainingCohorts } = vi.hoisted(() => ({
  submitTrainingApplication: vi.fn(),
  getOpenTrainingCohorts: vi.fn(),
}));

vi.mock('@/frontend/api/training', () => ({ submitTrainingApplication, getOpenTrainingCohorts }));

const COHORT = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  course_slug: 'build-digital-products',
  label: 'الدُّفعة الأولى',
  starts_at: '2026-11-01T00:00:00.000Z',
  capacity: 10,
  seats_taken: 3,
  status: 'open' as const,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  submitTrainingApplication.mockReset();
  getOpenTrainingCohorts.mockReset();
  getOpenTrainingCohorts.mockResolvedValue([COHORT]);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const nextButton = () => screen.getByRole('button', { name: /التَّالي/ });

/** Step 1 -> step 2, then fill the details step. */
async function advanceAndFillDetails() {
  await waitFor(() => expect(nextButton()).not.toBeDisabled());
  fireEvent.click(nextButton());
  await screen.findByLabelText(/الاسم الكامل/);
  fireEvent.change(screen.getByLabelText(/الاسم الكامل/), { target: { value: 'أحمد العلي' } });
  fireEvent.change(screen.getByLabelText(/رقم واتساب/), { target: { value: '+9647701234567' } });
}

describe('TrainingApplicationWizard', () => {
  it('starts on the cohort step and lets Next through when no cohort is required', async () => {
    render(<TrainingApplicationWizard />);

    expect(await screen.findByText('الدُّفعة الأولى')).toBeInTheDocument();
    expect(screen.getByText('7 أماكن متبقية')).toBeInTheDocument();

    await waitFor(() => expect(nextButton()).not.toBeDisabled());
  });

  it('sends the chosen cohort with the application', async () => {
    submitTrainingApplication.mockResolvedValue({
      success: true,
      referenceCode: 'TRN-2026-A7K2M9QX',
    });

    render(<TrainingApplicationWizard />);
    fireEvent.click(await screen.findByRole('radio', { name: /الدُّفعة الأولى/ }));
    await advanceAndFillDetails();
    fireEvent.click(screen.getByRole('button', { name: /أرسِل طلب التَّسجيل/ }));

    await waitFor(() =>
      expect(submitTrainingApplication).toHaveBeenCalledWith(
        expect.objectContaining({ cohort_id: COHORT.id, full_name: 'أحمد العلي' })
      )
    );
  });

  it('shows the reference code on success and reports the submission', async () => {
    submitTrainingApplication.mockResolvedValue({
      success: true,
      referenceCode: 'TRN-2026-A7K2M9QX',
    });
    const onSubmitted = vi.fn();

    render(<TrainingApplicationWizard onSubmitted={onSubmitted} />);
    await advanceAndFillDetails();
    fireEvent.click(screen.getByRole('button', { name: /أرسِل طلب التَّسجيل/ }));

    expect(await screen.findByText('TRN-2026-A7K2M9QX')).toBeInTheDocument();
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it('surfaces the API error and stays on the form', async () => {
    submitTrainingApplication.mockResolvedValue({ success: false, error: 'تعذّر الإرسال.' });

    render(<TrainingApplicationWizard />);
    await advanceAndFillDetails();
    fireEvent.click(screen.getByRole('button', { name: /أرسِل طلب التَّسجيل/ }));

    expect(await screen.findByText('تعذّر الإرسال.')).toBeInTheDocument();
    expect(screen.queryByText('رقم الطَّلب')).not.toBeInTheDocument();
  });

  it('still lets a student apply when no cohort is open', async () => {
    getOpenTrainingCohorts.mockResolvedValue([]);

    render(<TrainingApplicationWizard />);

    expect(await screen.findByText('لا توجد دُفعات مفتوحة للتَّسجيل حاليًّا.')).toBeInTheDocument();
    await waitFor(() => expect(nextButton()).not.toBeDisabled());
  });

  it('links the privacy policy on the details step', async () => {
    render(<TrainingApplicationWizard />);
    fireEvent.click(nextButton());
    await screen.findByLabelText(/الاسم الكامل/);

    expect(screen.getByRole('link', { name: 'سياسة الخصوصيَّة' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });
});
