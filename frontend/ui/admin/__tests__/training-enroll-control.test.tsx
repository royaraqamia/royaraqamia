import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EnrollControl } from '../training-enroll-control';

const mocks = vi.hoisted(() => ({
  enrollTrainingApplication: vi.fn(),
  releaseTrainingApplication: vi.fn(),
  getTrainingCohorts: vi.fn(),
}));

vi.mock('@/frontend/api/training', () => ({
  enrollTrainingApplication: mocks.enrollTrainingApplication,
  releaseTrainingApplication: mocks.releaseTrainingApplication,
  getTrainingCohorts: mocks.getTrainingCohorts,
}));

const APPLICATION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const COURSE_SLUG = 'build-digital-products';
const COHORT = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  course_slug: COURSE_SLUG,
  label: 'الدُّفعة الأولى',
  starts_at: '2026-11-01T00:00:00.000Z',
  capacity: 10,
  seats_taken: 3,
  status: 'open' as const,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};
const OTHER_COURSE_COHORT = {
  ...COHORT,
  id: 'c2b6f0b8-5e4e-4d3f-9a1b-2f6a1c0d7e21',
  course_slug: 'another-course',
  label: 'دُفعة دورة أخرى',
};

beforeEach(() => {
  mocks.enrollTrainingApplication.mockReset();
  mocks.releaseTrainingApplication.mockReset();
  mocks.getTrainingCohorts.mockReset();
  mocks.getTrainingCohorts.mockResolvedValue([COHORT]);
});

describe('EnrollControl', () => {
  it('offers a cohort picker and an enroll button when not enrolled', async () => {
    render(
      <EnrollControl
        applicationId={APPLICATION_ID}
        courseSlug={COURSE_SLUG}
        isEnrolled={false}
        enrolledCohortId={null}
        onChanged={vi.fn()}
      />
    );

    expect(await screen.findByLabelText('اختر الدُّفعة للتَّسجيل')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تسجيل/ })).toBeDisabled();
  });

  it('releases the seat and reports the change', async () => {
    mocks.releaseTrainingApplication.mockResolvedValue({ success: true });
    const onChanged = vi.fn();

    render(
      <EnrollControl
        applicationId={APPLICATION_ID}
        courseSlug={COURSE_SLUG}
        isEnrolled
        enrolledCohortId={COHORT.id}
        onChanged={onChanged}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /إلغاء التَّسجيل/ }));

    await waitFor(() =>
      expect(mocks.releaseTrainingApplication).toHaveBeenCalledWith(APPLICATION_ID, {
        status: 'new',
      })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it('names the enrolled cohort once its data has loaded', async () => {
    render(
      <EnrollControl
        applicationId={APPLICATION_ID}
        courseSlug={COURSE_SLUG}
        isEnrolled
        enrolledCohortId={COHORT.id}
        onChanged={vi.fn()}
      />
    );

    expect(await screen.findByText(`مُسجَّل في ${COHORT.label}`)).toBeInTheDocument();
  });

  it('surfaces a release failure and leaves the row enrolled', async () => {
    mocks.releaseTrainingApplication.mockResolvedValue({
      success: false,
      error: 'تعذَّر الإلغاء.',
    });
    const onChanged = vi.fn();

    render(
      <EnrollControl
        applicationId={APPLICATION_ID}
        courseSlug={COURSE_SLUG}
        isEnrolled
        enrolledCohortId={COHORT.id}
        onChanged={onChanged}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /إلغاء التَّسجيل/ }));

    expect(await screen.findByText('تعذَّر الإلغاء.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('offers only cohorts from the application’s own course', async () => {
    mocks.getTrainingCohorts.mockResolvedValue([COHORT, OTHER_COURSE_COHORT]);

    render(
      <EnrollControl
        applicationId={APPLICATION_ID}
        courseSlug={COURSE_SLUG}
        isEnrolled={false}
        enrolledCohortId={null}
        onChanged={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByLabelText('اختر الدُّفعة للتَّسجيل'));

    expect(
      await screen.findByRole('option', { name: new RegExp(COHORT.label) })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: new RegExp(OTHER_COURSE_COHORT.label) })
    ).not.toBeInTheDocument();
  });

  it('shows the empty state when the course has no cohort of its own', async () => {
    mocks.getTrainingCohorts.mockResolvedValue([OTHER_COURSE_COHORT]);

    render(
      <EnrollControl
        applicationId={APPLICATION_ID}
        courseSlug={COURSE_SLUG}
        isEnrolled={false}
        enrolledCohortId={null}
        onChanged={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByLabelText('اختر الدُّفعة للتَّسجيل'));

    expect(await screen.findByText('لا توجد دُفعات')).toBeInTheDocument();
  });
});
