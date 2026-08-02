'use client';

import { useState, useActionState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { WarningCircle, ArrowLeft, Clock, CheckCircle } from '@phosphor-icons/react';
import { OtpInput } from '@/frontend/ui/shared/otp-input';
import { verifyOtp, resendOtp } from '@/backend/actions/auth';
import { Button } from '@/frontend/ui/ui/button';
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
  const [state, formAction, isPending] = useActionState<VerifyState, FormData>(verifyOtp, null);
  const [resendState, resendAction, isResending] = useActionState(resendOtp, null);
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
    if (resendState?.message) {
      sessionStorage.setItem(OTP_START_KEY, String(Date.now()));
      setCountdown(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }, [resendState?.message, OTP_START_KEY]);

  // Handle successful verification with feedback
  useEffect(() => {
    if (state && 'success' in state && state.success) {
      setIsVerified(true);
      sessionStorage.removeItem(OTP_START_KEY);
      const redirectToUrl = state.redirectTo ?? '/';
      const timer = setTimeout(() => {
        router.replace(redirectToUrl);
      }, 1200);
      return () => clearTimeout(timer);
    }
    return;
  }, [state, router, OTP_START_KEY]);

  if (!email) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const isExpired = countdown <= 0;

  return (
    <AuthCard
      title="تحقق من البريد الإلكتروني"
      description={
        <>
          أدخل رمز التحقق المكون من 6 أرقام المرسل إلى{' '}
          <span className="font-medium text-foreground">{email}</span>
        </>
      }
    >
      <div className="space-y-6">
        {isVerified ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            <div className="size-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle size={36} className="text-success" />
            </div>
            <p className="text-lg font-semibold text-foreground">تم التحقق بنجاح</p>
            <p className="text-sm text-muted-foreground">جارِ تحويلك...</p>
          </motion.div>
        ) : (
          <>
            <form action={formAction} className="space-y-6">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="otp" value={otp} />
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <OtpInput
                value={otp}
                onChange={setOtp}
                disabled={isPending}
                hasError={!!state?.message}
              />

              {!isExpired && (
                <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <Clock size={16} />
                  <span>
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                  </span>
                </div>
              )}

              {state?.message && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                >
                  <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
                  <p role="alert" className="text-sm text-destructive">
                    {state.message}
                  </p>
                </motion.div>
              )}

              <Button
                type="submit"
                isLoading={isPending}
                disabled={otp.length !== 6}
                className="w-full h-12 gradient-primary text-white cta-glow"
              >
                {isPending ? 'جاري التحقق...' : 'تحقق من الرمز'}
              </Button>
            </form>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">لم تتلقَ الرمز؟</p>
              <form action={resendAction}>
                <input type="hidden" name="email" value={email} />
                <Button
                  type="submit"
                  variant="link"
                  disabled={isResending || resendCooldown > 0}
                  className="text-sm"
                >
                  {isResending
                    ? 'جاري إعادة الإرسال...'
                    : resendCooldown > 0
                      ? `إعادة الإرسال بعد ${resendCooldown} ثانية`
                      : 'إعادة إرسال الرمز'}
                </Button>
              </form>
              {resendState?.message && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-success"
                >
                  {resendState.message}
                </motion.p>
              )}
            </div>

            <div className="flex justify-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={16} />
                العودة إلى تسجيل الدخول
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthCard>
  );
}
