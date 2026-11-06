import { describe, expect, it } from 'vitest';
import {
  OTP_EXPIRY_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  verifyOtpInitialState,
  verifyOtpReducer,
  type VerifyOtpState,
} from '@/app/auth/verify-otp/verify-otp.reducer';

function stateOf(patch: Partial<VerifyOtpState> = {}): VerifyOtpState {
  return { ...verifyOtpInitialState(), ...patch };
}

describe('verifyOtpInitialState', () => {
  it('starts idle, with a full code lifetime and no cooldown', () => {
    expect(verifyOtpInitialState()).toEqual({
      otp: '',
      verifying: false,
      outcome: { status: 'idle' },
      resending: false,
      resendOutcome: { status: 'idle' },
      countdown: OTP_EXPIRY_SECONDS,
      resendCooldown: 0,
    });
  });
});

describe('verification', () => {
  it('clears the previous outcome when a new attempt starts', () => {
    const state = verifyOtpReducer(
      stateOf({ outcome: { status: 'failed', message: 'رمز غير صحيح' } }),
      { type: 'verifyStarted' }
    );

    expect(state).toMatchObject({ verifying: true, outcome: { status: 'idle' } });
  });

  it('keeps a rejected code as one failure, not as loose optional fields', () => {
    const state = verifyOtpReducer(stateOf({ verifying: true }), {
      type: 'verifyRejected',
      message: 'رمز غير صحيح',
      offline: false,
    });

    expect(state.outcome).toEqual({ status: 'failed', message: 'رمز غير صحيح' });
    expect(state.verifying).toBe(false);
  });

  it('reads a request that never reached the server as offline, not as a bad code', () => {
    const state = verifyOtpReducer(stateOf({ verifying: true }), {
      type: 'verifyRejected',
      message: 'network',
      offline: true,
    });

    expect(state.outcome).toEqual({ status: 'offline' });
    expect(state.verifying).toBe(false);
  });

  it('records where a verified code should land', () => {
    const state = verifyOtpReducer(stateOf({ verifying: true }), {
      type: 'verifySucceeded',
      redirectTo: '/account',
    });

    expect(state).toMatchObject({
      verifying: false,
      outcome: { status: 'verified', redirectTo: '/account' },
    });
  });

  it('settles the flag even when the request throws', () => {
    const state = verifyOtpReducer(stateOf({ verifying: true }), { type: 'verifyFinished' });

    expect(state.verifying).toBe(false);
    expect(state.outcome).toEqual({ status: 'idle' });
  });
});

describe('resending', () => {
  it('restarts both clocks when a fresh code is sent', () => {
    const state = verifyOtpReducer(stateOf({ resending: true, countdown: 12 }), {
      type: 'resendSucceeded',
      message: 'أُرسل رمز جديد',
    });

    expect(state).toMatchObject({
      resending: false,
      resendOutcome: { status: 'sent', message: 'أُرسل رمز جديد' },
      countdown: OTP_EXPIRY_SECONDS,
      resendCooldown: RESEND_COOLDOWN_SECONDS,
    });
  });

  it('reports a failed resend without touching the countdown', () => {
    const state = verifyOtpReducer(stateOf({ resending: true, countdown: 42 }), {
      type: 'resendRejected',
      message: 'تعذّر',
      offline: false,
    });

    expect(state).toMatchObject({
      resending: false,
      countdown: 42,
      resendOutcome: { status: 'failed', message: 'تعذّر' },
    });
  });

  it('reports an unreachable server as offline', () => {
    const state = verifyOtpReducer(stateOf({ resending: true }), {
      type: 'resendRejected',
      message: 'network',
      offline: true,
    });

    expect(state.resendOutcome).toEqual({ status: 'offline' });
  });
});

describe('clocks', () => {
  it('ticks down and stops at zero', () => {
    expect(verifyOtpReducer(stateOf({ countdown: 3 }), { type: 'countdownTicked' }).countdown).toBe(
      2
    );

    const expired = stateOf({ countdown: 0 });
    expect(verifyOtpReducer(expired, { type: 'countdownTicked' })).toBe(expired);
  });

  it('ticks the resend cooldown and stops at zero', () => {
    expect(
      verifyOtpReducer(stateOf({ resendCooldown: 2 }), { type: 'resendCooldownTicked' })
        .resendCooldown
    ).toBe(1);

    const ready = stateOf({ resendCooldown: 0 });
    expect(verifyOtpReducer(ready, { type: 'resendCooldownTicked' })).toBe(ready);
  });

  it('restores the countdown read back from the session', () => {
    expect(verifyOtpReducer(stateOf(), { type: 'countdownRestored', seconds: 77 }).countdown).toBe(
      77
    );
  });
});
