import { describe, expect, it } from 'vitest';
import {
  authSubmitReducer,
  INITIAL_AUTH_SUBMIT,
  type AuthSubmitState,
} from '@/app/auth/auth-submit.reducer';

describe('authSubmitReducer', () => {
  it('starts idle with no sentence', () => {
    expect(INITIAL_AUTH_SUBMIT).toEqual({ message: null, offline: false, pending: false });
  });

  it('clears the last answer and raises the spinner when a request leaves', () => {
    const previous: AuthSubmitState = { message: 'قديم', offline: true, pending: false };

    expect(authSubmitReducer(previous, { type: 'submitStarted' })).toEqual({
      message: null,
      offline: false,
      pending: true,
    });
  });

  it('keeps the spinner up while it shows the answer', () => {
    const pending: AuthSubmitState = { message: null, offline: false, pending: true };

    expect(
      authSubmitReducer(pending, {
        type: 'submitAnswered',
        message: 'البريد مستخدم',
        offline: false,
      })
    ).toEqual({ message: 'البريد مستخدم', offline: false, pending: true });
  });

  it('names an unreachable server while keeping its sentence', () => {
    const pending: AuthSubmitState = { message: null, offline: false, pending: true };

    expect(
      authSubmitReducer(pending, {
        type: 'submitAnswered',
        message: 'تعذّر الوصول',
        offline: true,
      })
    ).toEqual({ message: 'تعذّر الوصول', offline: true, pending: true });
  });

  it('lowers the spinner when the request settles but keeps the answer', () => {
    const answered: AuthSubmitState = { message: 'تم', offline: false, pending: true };

    expect(authSubmitReducer(answered, { type: 'submitSettled' })).toEqual({
      message: 'تم',
      offline: false,
      pending: false,
    });
  });

  it('leaves an idle state alone when it settles again', () => {
    expect(authSubmitReducer(INITIAL_AUTH_SUBMIT, { type: 'submitSettled' })).toBe(
      INITIAL_AUTH_SUBMIT
    );
  });
});
