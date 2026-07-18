'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { OtpInput } from '@/components/shared/otp-input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface OtpVerifyStepProps {
  email: string;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  onVerify: (otp: string) => void;
  onResend: () => void;
  onBack: () => void;
  backLabel?: string;
}

export function OtpVerifyStep({
  email,
  loading,
  error,
  successMessage,
  onVerify,
  onResend,
  onBack,
  backLabel,
}: OtpVerifyStepProps) {
  const [otpValue, setOtpValue] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleResend = () => {
    if (resendCooldown > 0) return;
    onResend();
    startCooldown();
  };

  function handleVerifyClick() {
    if (otpValue.length === 6) {
      onVerify(otpValue);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1.5">تم إرسال رمز التحقق إلى</p>
        <p className="text-sm font-medium text-foreground" dir="ltr">
          {email}
        </p>
        <p className="text-xs text-muted-foreground mt-2.5">أدخل رمز التحقق المكون من 6 أرقام</p>
      </div>

      <OtpInput length={6} disabled={loading} value={otpValue} onChange={setOtpValue} />

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-3.5 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20 text-center transition-smooth"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 bg-success/10 text-success dark:bg-success/20 dark:text-success text-sm rounded-xl border border-success/20 dark:border-success/80 text-center flex items-center justify-center gap-2 transition-smooth"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{successMessage}</span>
        </div>
      )}

      <Button
        type="button"
        onClick={handleVerifyClick}
        disabled={loading || otpValue.length < 6}
        className="w-full py-3 h-auto transition-smooth shadow-sm hover:shadow-md"
      >
        {loading ? (
          <>
            <Loader2 className="ml-2 size-4 animate-spin" />
            جارٍ التحقق من الرمز...
          </>
        ) : (
          'تأكيد الرمز'
        )}
      </Button>

      <div className="text-center space-y-2.5">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || loading}
          className="text-sm text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline transition-smooth"
        >
          {resendCooldown > 0
            ? `إعادة إرسال الرمز بعد ${resendCooldown} ثانية`
            : 'إعادة إرسال الرمز'}
        </button>
        <br />
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-smooth"
        >
          {backLabel || 'العودة إلى تسجيل الدخول'}
        </button>
      </div>
    </div>
  );
}
