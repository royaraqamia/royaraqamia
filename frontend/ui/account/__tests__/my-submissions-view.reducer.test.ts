import { describe, expect, it } from 'vitest';
import type { ProjectRequest } from '@/shared/contracts/project-requests';
import type { Retainer } from '@/shared/contracts/retainers';
import {
  submissionsInitialState,
  submissionsReducer,
  type SubmissionsState,
} from '@/frontend/ui/account/my-submissions-view.reducer';

const REQUEST = { id: 'pr-1', reference_code: 'R1' } as unknown as ProjectRequest;
const OTHER_REQUEST = { id: 'pr-2', reference_code: 'R2' } as unknown as ProjectRequest;
const RETAINER = { id: 'rt-1', reference_code: 'T1' } as unknown as Retainer;

function stateOf(patch: Partial<SubmissionsState> = {}): SubmissionsState {
  return { ...submissionsInitialState(), ...patch };
}

describe('submissionsInitialState', () => {
  it('knows nothing until the four reads land', () => {
    expect(submissionsInitialState()).toEqual({
      projectRequests: null,
      retainers: null,
      applications: null,
      bookings: null,
      editingKey: null,
      loadFailed: false,
      loadOffline: false,
    });
  });
});

describe('reading', () => {
  it('clears the previous failure when a read starts', () => {
    expect(
      submissionsReducer(stateOf({ loadFailed: true, loadOffline: true }), { type: 'loadStarted' })
    ).toMatchObject({ loadFailed: false, loadOffline: false });
  });

  it('lands all four lists together', () => {
    const state = submissionsReducer(stateOf(), {
      type: 'loaded',
      projectRequests: [REQUEST],
      retainers: [RETAINER],
      applications: [],
      bookings: [],
    });

    expect(state).toMatchObject({
      projectRequests: [REQUEST],
      retainers: [RETAINER],
      applications: [],
      bookings: [],
    });
  });

  it('keeps an unreachable server apart from a refused one (ADR-0031)', () => {
    expect(submissionsReducer(stateOf(), { type: 'loadFailed', offline: true })).toMatchObject({
      loadFailed: true,
      loadOffline: true,
    });

    expect(submissionsReducer(stateOf(), { type: 'loadFailed', offline: false })).toMatchObject({
      loadFailed: true,
      loadOffline: false,
    });
  });
});

describe('editing', () => {
  it('opens one row and closes it', () => {
    const opened = submissionsReducer(stateOf(), {
      type: 'editStarted',
      key: 'project_request:pr-1',
    });
    expect(opened.editingKey).toBe('project_request:pr-1');

    expect(submissionsReducer(opened, { type: 'editStopped' }).editingKey).toBeNull();
  });
});

describe('saving a row', () => {
  it('replaces the saved row in place and closes the form', () => {
    const saved = { ...REQUEST, reference_code: 'R1-EDITED' } as ProjectRequest;
    const state = submissionsReducer(
      stateOf({ projectRequests: [REQUEST, OTHER_REQUEST], editingKey: 'project_request:pr-1' }),
      { type: 'projectRequestSaved', request: saved }
    );

    expect(state.projectRequests).toEqual([saved, OTHER_REQUEST]);
    expect(state.editingKey).toBeNull();
  });

  it('does not invent a list that has not arrived', () => {
    const state = submissionsReducer(stateOf(), { type: 'retainerSaved', retainer: RETAINER });

    expect(state.retainers).toBeNull();
    expect(state.editingKey).toBeNull();
  });
});
