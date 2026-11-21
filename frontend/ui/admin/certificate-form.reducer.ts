/** The five fields one certificate writes. */
export interface CertificateFormFields {
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date: string;
  grade_or_status: string;
}

/**
 * The certificate form: its draft, the recipients to notify, the request in
 * flight and the two error surfaces.
 *
 * A field edit wrote the field and cleared that field's error together, and a
 * submit wrote the loading flag and the error result from one `try/finally` —
 * so they are one state here.
 */
export interface CertificateFormState {
  loading: boolean;
  errors: Record<string, string>;
  globalError: string;
  form: CertificateFormFields;
  recipientUserIds: string[];
}

export type CertificateFormAction =
  | { type: 'fieldChanged'; field: keyof CertificateFormFields; value: string }
  | { type: 'recipientsChanged'; ids: string[] }
  | { type: 'submitStarted' }
  | { type: 'submitFailed'; error: string; fieldErrors?: Record<string, string> }
  | { type: 'submitFinished' };

export function certificateFormInitialState(
  form: CertificateFormFields,
  recipientUserIds: string[]
): CertificateFormState {
  return { loading: false, errors: {}, globalError: '', form, recipientUserIds };
}

export function certificateFormReducer(
  state: CertificateFormState,
  action: CertificateFormAction
): CertificateFormState {
  switch (action.type) {
    case 'fieldChanged': {
      const errors = { ...state.errors };
      delete errors[action.field];
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
        errors,
      };
    }

    case 'recipientsChanged':
      return { ...state, recipientUserIds: action.ids };

    case 'submitStarted':
      return { ...state, loading: true, globalError: '' };

    case 'submitFailed':
      return {
        ...state,
        globalError: action.error,
        errors: action.fieldErrors ?? state.errors,
      };

    case 'submitFinished':
      return state.loading ? { ...state, loading: false } : state;
  }
}
