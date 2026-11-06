'use client';

import { Suspense, useEffect, useReducer } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleAlert, ArrowLeft, Clock, CircleCheckBig, CircleCheck, Loader2 } from 'lucide-react';
import { OtpInput } from '@/frontend/ui/shared/otp-input';
import { verifyOtp, resendOtp } from '@/frontend/api/auth';
import { Button } from '@/frontend/ui/primitives/button';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { authLink } from '@/frontend/ui/auth/auth-links';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { OTP_EXPIRY_SECONDS, verifyOtpInitialState, verifyOtpReducer } from './verify-otp.reducer';

const OTP_START_KEY_PREFIX = 'otp_start_';

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const redirectTo = searchParams.get('redirect') ?? '/';

  const OTP_START_KEY = `${OTP_START_KEY_PREFIX}${email}`;

  const [form, dispatch] = useReducer(verifyOtpReducer, undefined, verifyOtpInitialState);

  const { otp, verifying, outcome, resending, resendOutcome, countdown, resendCooldown } = form;
  const isVerified = outcome.status === 'verified';

  // Redirect if no email
  useEffect(() => {
    if (!email) {
      router.replace('/auth/login');
    }
  }, [email, router]);

  // Initialize or restore countdown from sessionStorage
  useEffect(() => {
    if (!email) return;
    const stored = sessionStorage.getItem(OTP_START_KEY);
    if (stored) {
      const elapsed = Math.floor((Date.now() - Number(stored)) / 1000);
      dispatch({ type: 'countdownRestored', seconds: Math.max(0, OTP_EXPIRY_SECONDS - elapsed) });
    } else {
      sessionStorage.setItem(OTP_START_KEY, String(Date.now()));
    }
  }, [email, OTP_START_KEY]);

  // OTP expiry countdown
  useEffect(() => {
    if (countdown <= 0 || !email) return;
    const timer = setInterval(() => dispatch({ type: 'countdownTicked' }), 1000);
    return () => clearInterval(timer);
  }, [countdown, email]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => dispatch({ type: 'resendCooldownTicked' }), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Handle successful verification with feedback
  useEffect(() => {
    if (outcome.status !== 'verified') return;
    sessionStorage.removeItem(OTP_START_KEY);
    const timer = setTimeout(() => {
      router.replace(outcome.redirectTo);
    }, 1200);
    return () => clearTimeout(timer);
  }, [outcome, router, OTP_START_KEY]);

  if (!email) return null;

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: 'verifyStarted' });
    try {
      const result = await verifyOtp({ email, otp, redirectTo });
      if (!result.ok) {
        dispatch({ type: 'verifyRejected', message: result.message, offline: result.offline });
        return;
      }
      dispatch({ type: 'verifySucceeded', redirectTo: result.redirectUrl });
    } finally {
      dispatch({ type: 'verifyFinished' });
    }
  }

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: 'resendStarted' });
    try {
      const result = await resendOtp(email);
      if (!result.ok) {
        dispatch({ type: 'resendRejected', message: result.message, offline: result.offline });
        return;
      }
      // The stored start follows the fresh code, so a reload restores its own
      // five minutes rather than the previous code's.
      sessionStorage.setItem(OTP_START_KEY, String(Date.now()));
      dispatch({ type: 'resendSucceeded', message: result.message });
    } finally {
      dispatch({ type: 'resendFinished' });
    }
  }

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const isExpired = countdown <= 0;

  return (
    <AuthCard
      title="تحقُّق من البريد الإلكتروني"
      description={
        <span className="block leading-relaxed">
          أدخِل رمز التَّحقُّق المُكوَّن من 6 أرقام المُرسَل إلى{' '}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-foreground border border-neutral-200/80 dark:border-neutral-700/60 shadow-2xs dir-ltr">
            {email}
          </span>
        </span>
      }
    >
      <div className="w-full max-w-sm mx-auto space-y-6">
        {isVerified ? (
          <div
            key="verified-state"
            className="flex flex-col items-center justify-center gap-4 py-8 px-4 text-center"
          >
            <div className="relative flex items-center justify-center">
              <div className="relative size-16 rounded-2xl bg-linear-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                <CircleCheckBig
                  size={38}
                  fill="currentColor"
                  className="text-emerald-500 dark:text-emerald-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                تمَّ التَّحقُّق بنجاح
              </h3>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                جاري تحويلك تلقائيًّا...
              </p>
            </div>
          </div>
        ) : (
          <div key="form-state" className="space-y-6">
            <form onSubmit={handleVerify} className="space-y-5">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="otp" value={otp} />
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <div className="py-2 flex justify-center">
                <OtpInput
                  value={otp}
                  onChange={(value) => dispatch({ type: 'otpChanged', otp: value })}
                  disabled={verifying}
                  hasError={outcome.status === 'failed'}
                />
              </div>

              {!isExpired && (
                <div className="flex items-center justify-center" aria-live="polite">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-300 ${
                      countdown <= 60
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-neutral-100/80 border-neutral-200/80 text-muted-foreground dark:bg-neutral-800/80 dark:border-neutral-700/80'
                    }`}
                  >
                    <Clock size={14} className="shrink-0" />
                    <span>ينتهي الرَّمز خلال</span>
                    <span className="font-mono font-bold tracking-wider tabular-nums">
                      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}

              {outcome.status === 'offline' ? (
                <NeedsConnection
                  variant="inline"
                  message="لم يصل طلب التَّحقُّق إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
                />
              ) : (
                outcome.status === 'failed' && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive shadow-2xs">
                    <CircleAlert size={18} className="shrink-0 mt-0.5 text-destructive" />
                    <p role="alert" className="text-xs sm:text-sm font-medium leading-relaxed">
                      {outcome.message}
                    </p>
                  </div>
                )
              )}

              <HeroCtaButton
                type="submit"
                disabled={otp.length !== 6 || verifying}
                className="w-full"
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                    <span>جاري التَّحقُّق...</span>
                  </>
                ) : (
                  'تحقُّق من الرَّمز'
                )}
              </HeroCtaButton>
            </form>

            <div className="text-center space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">لم تتلقَّ الرَّمز؟</p>

              <form onSubmit={handleResend} className="flex flex-col items-center gap-2">
                <input type="hidden" name="email" value={email} />
                <Button
                  type="submit"
                  variant="link"
                  disabled={resending || resendCooldown > 0}
                  className="text-xs font-bold text-primary hover:text-primary/80 transition-colors p-0 h-auto focus-visible:ring-2 focus-visible:ring-ring rounded-full disabled:opacity-50"
                >
                  {resending
                    ? 'جاري إعادة الإرسال...'
                    : resendCooldown > 0
                      ? `إعادة الإرسال بعد (${resendCooldown}ث)`
                      : 'إعادة إرسال الرَّمز'}
                </Button>
              </form>

              <p className="text-[11px] leading-relaxed text-muted-foreground/80 px-2">
                إذا كان لديك حساب مُسبقًا بهذا البريد، فقد أرسلنا إليك روابط الدُّخول وإعادة تعيين
                كلمة المرور بدلًا من الرَّمز.
              </p>

              {resendOutcome.status === 'offline' && (
                <NeedsConnection
                  variant="inline"
                  message="لم يصل طلب إعادة إرسال الرَّمز إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
                  className="text-start"
                />
              )}

              {resendOutcome.status === 'failed' && (
                <p role="alert" className="text-xs sm:text-sm font-medium text-destructive">
                  {resendOutcome.message}
                </p>
              )}

              {resendOutcome.status === 'sent' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                  <CircleCheck size={14} className="shrink-0" />
                  <span>{resendOutcome.message}</span>
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-center border-t border-border/40">
              <Link
                href={authLink('/auth/login', redirectTo)}
                className="group inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-safe duration-200 py-1.5 px-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft
                  size={15}
                  className="transition-transform duration-200 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 rtl:rotate-180"
                />
                <span>العودة إلى تسجيل الدُّخول</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthCard>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpForm />
    </Suspense>
  );
}
