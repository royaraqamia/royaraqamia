'use client';

import { useState, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { OtpInput } from '@/components/shared/otp-input';
import { verifyOtp, resendOtp } from '@/lib/actions/auth';

export default function VerifyOtpPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [otp, setOtp] = useState('');
  const [state, formAction, isPending] = useActionState(verifyOtp, null);
  const [resendState, resendAction] = useActionState(resendOtp, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">تحقق من البريد الإلكتروني</h1>
          <p className="text-muted-foreground mt-2">
            أدخل رمز التحقق المرسل إلى <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <form action={formAction} className="space-y-6">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="otp" value={otp} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <OtpInput value={otp} onChange={setOtp} disabled={isPending} />

          {state?.message && (
            <p role="alert" className="text-sm text-destructive text-center">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || otp.length !== 6}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-[44px]"
          >
            {isPending ? 'جاري التحقق...' : 'تحقق'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">لم تتلقى الرمز؟</p>
          <form action={resendAction}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              className="text-sm text-primary hover:underline mt-1 cursor-pointer"
            >
              إعادة الإرسال
            </button>
          </form>
          {resendState?.message && (
            <p className="text-sm text-muted-foreground mt-1">{resendState.message}</p>
          )}
        </div>

        <div className="text-center">
          <Link
            href="/auth/login"
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            العودة إلى تسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
