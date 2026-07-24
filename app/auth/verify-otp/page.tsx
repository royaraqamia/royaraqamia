'use client';

import { useState, useActionState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { WarningCircle, ArrowLeft, Clock } from '@phosphor-icons/react';
import { OtpInput } from '@/components/shared/otp-input';
import { verifyOtp, resendOtp } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/components/auth/AuthCard';

const OTP_EXPIRY_SECONDS = 5 * 60;

export default function VerifyOtpPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [otp, setOtp] = useState('');
  const [state, formAction, isPending] = useActionState(verifyOtp, null);
  const [resendState, resendAction, isResending] = useActionState(resendOtp, null);
  const [countdown, setCountdown] = useState(OTP_EXPIRY_SECONDS);
  const countdownRef = useRef(countdown);
  countdownRef.current = countdown;

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Reset countdown when OTP is resent successfully
  useEffect(() => {
    if (resendState?.message) {
      setCountdown(OTP_EXPIRY_SECONDS);
    }
  }, [resendState?.message]);

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
            <Button type="submit" variant="link" disabled={isResending} className="text-sm">
              {isResending ? 'جاري إعادة الإرسال...' : 'إعادة إرسال الرمز'}
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
      </div>
    </AuthCard>
  );
}
