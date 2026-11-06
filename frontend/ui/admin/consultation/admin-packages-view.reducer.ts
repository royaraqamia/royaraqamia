import type { ConsultationPackage } from '@/shared/contracts/consultation';

export interface PackageDraft {
  name: string;
  description: string;
  price_usd: string;
  duration_minutes: string;
  sessions_count: string;
  is_active: boolean;
}

export const EMPTY_PACKAGE_DRAFT: PackageDraft = {
  name: '',
  description: '',
  price_usd: '25',
  duration_minutes: '60',
  sessions_count: '1',
  is_active: true,
};

export function packageDraftOf(pkg: ConsultationPackage): PackageDraft {
  return {
    name: pkg.name,
    description: pkg.description ?? '',
    price_usd: String(pkg.price_usd),
    duration_minutes: String(pkg.duration_minutes),
    sessions_count: String(pkg.sessions_count),
    is_active: pkg.is_active,
  };
}

export interface PackageFormMessage {
  ok: boolean;
  text: string;
}

/**
 * The packages list and the form that edits it — the same shape as the training
 * cohorts view: which row is open, its draft, whether the form is drawn, the
 * request in flight, and the one message the page shows. Opening the form for a
 * row wrote four of these at once.
 */
export interface PackagesState {
  packages: ConsultationPackage[];
  loading: boolean;
  /** The package being edited, or null while creating. */
  editingId: string | null;
  draft: PackageDraft;
  showForm: boolean;
  saving: boolean;
  message: PackageFormMessage | null;
}

export type PackagesAction =
  | { type: 'loadStarted' }
  | { type: 'loaded'; packages: ConsultationPackage[] }
  | { type: 'createStarted' }
  | { type: 'editStarted'; pkg: ConsultationPackage }
  | { type: 'formClosed' }
  | { type: 'draftChanged'; patch: Partial<PackageDraft> }
  | { type: 'messageSet'; message: PackageFormMessage | null }
  | { type: 'saveStarted' }
  | { type: 'saveFinished' }
  | { type: 'saveSucceeded'; message: PackageFormMessage };

export function packagesInitialState(): PackagesState {
  return {
    packages: [],
    loading: true,
    editingId: null,
    draft: EMPTY_PACKAGE_DRAFT,
    showForm: false,
    saving: false,
    message: null,
  };
}

export function packagesReducer(state: PackagesState, action: PackagesAction): PackagesState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true };

    case 'loaded':
      return { ...state, packages: action.packages, loading: false };

    case 'createStarted':
      return {
        ...state,
        editingId: null,
        draft: EMPTY_PACKAGE_DRAFT,
        showForm: true,
        message: null,
      };

    case 'editStarted':
      return {
        ...state,
        editingId: action.pkg.id,
        draft: packageDraftOf(action.pkg),
        showForm: true,
        message: null,
      };

    case 'formClosed':
      // The draft is kept: reopening the form for the same row is the same edit.
      return { ...state, showForm: false };

    case 'draftChanged':
      return { ...state, draft: { ...state.draft, ...action.patch } };

    case 'messageSet':
      return { ...state, message: action.message };

    case 'saveStarted':
      return { ...state, saving: true };

    case 'saveFinished':
      return { ...state, saving: false };

    case 'saveSucceeded':
      return { ...state, message: action.message, showForm: false };
  }
}
