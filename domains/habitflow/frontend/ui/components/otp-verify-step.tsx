'use client';

import { useState, useEffect } from 'react';
import { OtpInput } from '@/components/shared/otp-input';
import { Button } from '@/components/ui/button';

interface OtpVerifyStepProps {
  email: string;
  loading: boolean;
  successMessage: string | null;
  onVerify: (otp: string) => void;
  onResend: () => void;
  onBack: () => void;
}

export default function OtpVerifyStep({
  email,
  loading,
  successMessage,
  onVerify,
  onResend,
  onBack,
}: OtpVerifyStepProps) {
  const [otpValue, setOtpValue] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const EXPIRY_MINUTES = 5;
  const totalSeconds = EXPIRY_MINUTES * 60;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = Math.max(0, totalSeconds - elapsed);
  const minutesLeft = Math.floor(remainingSeconds / 60);
  const secondsLeft = remainingSeconds % 60;
  const isExpired = remainingSeconds <= 0;

  function handleOtpComplete(otp: string) {
    onVerify(otp);
  }

  function handleVerifyClick() {
    if (otpValue.length === 6) {
      onVerify(otpValue);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">تم إرسال رمز التحقق إلى</p>
        <p className="text-sm font-medium text-foreground" dir="ltr">
          {email}
        </p>
        {!isExpired ? (
          <p className="text-xs text-muted-foreground mt-2">
            ينتهي الصلاحية خلال {String(minutesLeft).padStart(2, '0')}:
            {String(secondsLeft).padStart(2, '0')}
          </p>
        ) : (
          <p className="text-xs text-destructive mt-2">انتهت صلاحية الرمز. اطلب رمزًا جديدًا.</p>
        )}
      </div>

      <OtpInput
        length={6}
        disabled={loading || isExpired}
        value={otpValue}
        onChange={setOtpValue}
        onComplete={handleOtpComplete}
      />

      {successMessage && (
        <div className="p-3 bg-primary/10 text-primary text-sm rounded-xl border border-primary/20 text-center">
          {successMessage}
        </div>
      )}

      <Button
        type="button"
        onClick={handleVerifyClick}
        disabled={loading || otpValue.length < 6 || isExpired}
        className="w-full py-3 h-auto"
      >
        {loading ? 'جارٍ التحقق من الرمز...' : 'تحقق'}
      </Button>

      <div className="text-center space-y-2">
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className="text-sm text-primary underline-offset-4 hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 py-2 min-h-[44px]"
        >
          إعادة إرسال الرمز
        </button>
        <br />
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg transition-all duration-200 ease-out py-2 min-h-[44px]"
        >
          العودة إلى تسجيل الدخول
        </button>
      </div>
    </div>
  );
}
