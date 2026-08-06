'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { WarningCircle, ArrowLeft, Clock, CheckCircle } from '@phosphor-icons/react';
import { OtpInput } from '@/frontend/ui/shared/otp-input';
import { verifyOtp, resendOtp } from '@/frontend/api/auth';
import { Button } from '@/frontend/ui/primitives/button';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

const OTP_EXPIRY_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyOtpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const redirectTo = searchParams.get('redirect') ?? '/';

  const OTP_START_KEY = `otp_start_${email}`;

  type VerifyState = { message?: string; success?: boolean; redirectTo?: string } | null;
  const [otp, setOtp] = useState('');
  const [state, setState] = useState<VerifyState>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(OTP_EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const countdownRef = useRef(countdown);
  countdownRef.current = countdown;

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
      setCountdown(Math.max(0, OTP_EXPIRY_SECONDS - elapsed));
    } else {
      sessionStorage.setItem(OTP_START_KEY, String(Date.now()));
    }
  }, [email, OTP_START_KEY]);

  // OTP expiry countdown
  useEffect(() => {
    if (countdown <= 0 || !email) return;
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown, email]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Reset countdown when OTP is resent successfully
  useEffect(() => {
    if (resendMessage) {
      sessionStorage.setItem(OTP_START_KEY, String(Date.now()));
      setCountdown(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }, [resendMessage, OTP_START_KEY]);

  // Handle successful verification with feedback
  useEffect(() => {
    if (state && 'success' in state && state.success) {
      setIsVerified(true);
      sessionStorage.removeItem(OTP_START_KEY);
      const redirectToUrl = state.redirectTo ?? '/';
      const timer = setTimeout(() => {
        router.replace(redirectToUrl);
      }, 1200);
      return () => clearInterval(timer);
    }
    return;
  }, [state, router, OTP_START_KEY]);

  if (!email) return null;

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState(null);
    setIsPending(true);
    try {
      const result = await verifyOtp({ email, otp, redirectTo });
      if (!result.ok) {
        setState({ message: result.message });
        return;
      }
      setState({ success: true, redirectTo: result.redirectUrl });
    } finally {
      setIsPending(false);
    }
  }

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsResending(true);
    try {
      const result = await resendOtp(email);
      setResendMessage(result.message);
    } finally {
      setIsResending(false);
    }
  }

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const isExpired = countdown <= 0;

  return (
    <AuthCard
      title="تحقُّق من البريد الإلكتروني"
      description={
        <span className="block leading-relaxed">
          أدخِل رمز التَّحقُّق المُكوَّن من 6 أرقام المُرسَل إلى{' '}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-foreground border border-neutral-200/80 dark:border-neutral-700/60 shadow-2xs dir-ltr">
            {email}
          </span>
        </span>
      }
    >
      <div className="w-full max-w-sm mx-auto space-y-6">
        <AnimatePresence mode="wait">
          {isVerified ? (
            <motion.div
              key="verified-state"
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex flex-col items-center justify-center gap-4 py-8 px-4 text-center"
            >
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 blur-xl animate-pulse" />
                <div className="relative size-16 rounded-2xl bg-linear-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                  <CheckCircle
                    size={38}
                    weight="fill"
                    className="text-emerald-500 dark:text-emerald-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-foreground">
                  تمَّ التَّحقُّق بنجاح
                </h3>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-ping" />
                  جارِ تحويلك تلقائيًّا...
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <form onSubmit={handleVerify} className="space-y-5">
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="otp" value={otp} />
                <input type="hidden" name="redirectTo" value={redirectTo} />

                <div className="py-2 flex justify-center">
                  <OtpInput
                    value={otp}
                    onChange={setOtp}
                    disabled={isPending}
                    hasError={!!state?.message}
                  />
                </div>

                {!isExpired && (
                  <div className="flex items-center justify-center" aria-live="polite">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border backdrop-blur-md transition-colors duration-300 ${
                        countdown <= 60
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                          : 'bg-neutral-100/80 border-neutral-200/80 text-muted-foreground dark:bg-neutral-800/80 dark:border-neutral-700/80'
                      }`}
                    >
                      <Clock
                        size={14}
                        className={`shrink-0 ${countdown <= 60 ? 'animate-pulse' : ''}`}
                      />
                      <span>ينتهي الرَّمز خلال</span>
                      <span className="font-mono font-bold tracking-wider tabular-nums">
                        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                )}

                {state?.message && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive shadow-2xs"
                  >
                    <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
                    <p role="alert" className="text-xs sm:text-sm font-medium leading-relaxed">
                      {state.message}
                    </p>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  isLoading={isPending}
                  disabled={otp.length !== 6 || isPending}
                  className="w-full h-11 text-sm font-medium gradient-primary text-white cta-glow rounded-full shadow-xs hover:scale-[1.01] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                >
                  {isPending ? 'جاري التَّحقُّق...' : 'تحقُّق من الرَّمز'}
                </Button>
              </form>

              <div className="text-center space-y-3 pt-2">
                <p className="text-xs text-muted-foreground">لم تتلقَّ الرَّمز؟</p>

                <form onSubmit={handleResend} className="flex flex-col items-center gap-2">
                  <input type="hidden" name="email" value={email} />
                  <Button
                    type="submit"
                    variant="link"
                    disabled={isResending || resendCooldown > 0}
                    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors p-0 h-auto focus-visible:ring-2 focus-visible:ring-ring rounded-full disabled:opacity-50"
                  >
                    {isResending
                      ? 'جاري إعادة الإرسال...'
                      : resendCooldown > 0
                        ? `إعادة الإرسال بعد (${resendCooldown}ث)`
                        : 'إعادة إرسال الرَّمز'}
                  </Button>
                </form>

                {resendMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
                  >
                    <CheckCircle size={14} className="shrink-0" />
                    <span>{resendMessage}</span>
                  </motion.div>
                )}
              </div>

              <div className="pt-4 flex justify-center border-t border-border/40">
                <Link
                  href="/auth/login"
                  className="group inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-all duration-200 py-1.5 px-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft
                    size={15}
                    className="transition-transform duration-200 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 rtl:rotate-180"
                  />
                  <span>العودة إلى تسجيل الدُّخول</span>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthCard>
  );
}
