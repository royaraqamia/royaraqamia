import { describe, expect, it } from 'vitest';

import {
  certificateFormInitialState,
  certificateFormReducer,
  type CertificateFormState,
} from '@/frontend/ui/admin/certificate-form.reducer';

const FIELDS = {
  student_name: 'أحمد',
  course_name: 'تطوير الويب',
  issue_date: '2026-01-01',
  expiration_date: '',
  grade_or_status: '',
};

function stateOf(patch: Partial<CertificateFormState> = {}): CertificateFormState {
  return { ...certificateFormInitialState(FIELDS, []), ...patch };
}

describe('certificateFormInitialState', () => {
  it('starts ready to submit with the fields and recipients it was given', () => {
    expect(certificateFormInitialState(FIELDS, ['u-1'])).toEqual({
      loading: false,
      errors: {},
      globalError: '',
      form: FIELDS,
      recipientUserIds: ['u-1'],
    });
  });
});

describe('editing', () => {
  it('writes the field and clears only that field error', () => {
    const state = certificateFormReducer(
      stateOf({ errors: { student_name: 'مطلوب', course_name: 'مطلوب' } }),
      { type: 'fieldChanged', field: 'student_name', value: 'سارة' }
    );

    expect(state.form.student_name).toBe('سارة');
    expect(state.errors).toEqual({ course_name: 'مطلوب' });
  });

  it('keeps the other fields untouched', () => {
    const state = certificateFormReducer(stateOf(), {
      type: 'fieldChanged',
      field: 'grade_or_status',
      value: 'ممتاز',
    });

    expect(state.form).toEqual({ ...FIELDS, grade_or_status: 'ممتاز' });
  });

  it('replaces the recipient ids', () => {
    expect(
      certificateFormReducer(stateOf(), { type: 'recipientsChanged', ids: ['u-2'] })
        .recipientUserIds
    ).toEqual(['u-2']);
  });
});

describe('submitting', () => {
  it('raises the flag and clears the previous sentence', () => {
    expect(
      certificateFormReducer(stateOf({ globalError: 'قديم' }), { type: 'submitStarted' })
    ).toMatchObject({ loading: true, globalError: '' });
  });

  it('writes the sentence and the field errors together', () => {
    const state = certificateFormReducer(stateOf({ loading: true }), {
      type: 'submitFailed',
      error: 'تحقّق من الحقول',
      fieldErrors: { student_name: 'مطلوب' },
    });

    expect(state).toMatchObject({
      globalError: 'تحقّق من الحقول',
      errors: { student_name: 'مطلوب' },
    });
  });

  it('keeps the previous field errors when the answer carries none', () => {
    const state = certificateFormReducer(stateOf({ errors: { course_name: 'مطلوب' } }), {
      type: 'submitFailed',
      error: 'حدث خطأ',
    });

    expect(state.errors).toEqual({ course_name: 'مطلوب' });
  });

  it('lowers the flag when the submit settles', () => {
    const state = certificateFormReducer(stateOf({ loading: true }), {
      type: 'submitFinished',
    });

    expect(state.loading).toBe(false);
  });
});
