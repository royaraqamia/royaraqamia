export const OTP_EXPIRY_SECONDS = 5 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * What the verify request left behind. The three outcomes used to be three
 * optional fields that had to stay mutually consistent; they cannot disagree
 * when only one of them can exist.
 */
export type VerifyOutcome =
  | { status: 'idle' }
  | { status: 'offline' }
  | { status: 'failed'; message: string }
  | { status: 'verified'; redirectTo: string };

export type ResendOutcome =
  | { status: 'idle' }
  | { status: 'offline' }
  | { status: 'failed'; message: string }
  | { status: 'sent'; message: string };

export interface VerifyOtpState {
  otp: string;
  verifying: boolean;
  outcome: VerifyOutcome;
  resending: boolean;
  resendOutcome: ResendOutcome;
  /** Seconds left before the code expires. */
  countdown: number;
  /** Seconds left before another code may be requested. */
  resendCooldown: number;
}

export type VerifyOtpAction =
  | { type: 'otpChanged'; otp: string }
  | { type: 'countdownRestored'; seconds: number }
  | { type: 'countdownTicked' }
  | { type: 'resendCooldownTicked' }
  | { type: 'verifyStarted' }
  | { type: 'verifyRejected'; message: string; offline: boolean }
  | { type: 'verifySucceeded'; redirectTo: string }
  | { type: 'verifyFinished' }
  | { type: 'resendStarted' }
  | { type: 'resendRejected'; message: string; offline: boolean }
  | { type: 'resendSucceeded'; message: string }
  | { type: 'resendFinished' };

export function verifyOtpInitialState(): VerifyOtpState {
  return {
    otp: '',
    verifying: false,
    outcome: { status: 'idle' },
    resending: false,
    resendOutcome: { status: 'idle' },
    countdown: OTP_EXPIRY_SECONDS,
    resendCooldown: 0,
  };
}

export function verifyOtpReducer(state: VerifyOtpState, action: VerifyOtpAction): VerifyOtpState {
  switch (action.type) {
    case 'otpChanged':
      return { ...state, otp: action.otp };

    case 'countdownRestored':
      return { ...state, countdown: action.seconds };

    case 'countdownTicked':
      return state.countdown <= 0 ? state : { ...state, countdown: state.countdown - 1 };

    case 'resendCooldownTicked':
      return state.resendCooldown <= 0
        ? state
        : { ...state, resendCooldown: state.resendCooldown - 1 };

    case 'verifyStarted':
      return { ...state, verifying: true, outcome: { status: 'idle' } };

    case 'verifyRejected':
      return {
        ...state,
        verifying: false,
        outcome: action.offline
          ? { status: 'offline' }
          : { status: 'failed', message: action.message },
      };

    case 'verifySucceeded':
      return {
        ...state,
        verifying: false,
        outcome: { status: 'verified', redirectTo: action.redirectTo },
      };

    case 'resendStarted':
      return { ...state, resending: true, resendOutcome: { status: 'idle' } };

    case 'resendRejected':
      return {
        ...state,
        resending: false,
        resendOutcome: action.offline
          ? { status: 'offline' }
          : { status: 'failed', message: action.message },
      };

    case 'resendSucceeded':
      // A fresh code restarts both clocks: the code's own life, and the wait
      // before another one may be asked for.
      return {
        ...state,
        resending: false,
        resendOutcome: { status: 'sent', message: action.message },
        countdown: OTP_EXPIRY_SECONDS,
        resendCooldown: RESEND_COOLDOWN_SECONDS,
      };

    case 'verifyFinished':
      return state.verifying ? { ...state, verifying: false } : state;

    case 'resendFinished':
      return state.resending ? { ...state, resending: false } : state;
  }
}
