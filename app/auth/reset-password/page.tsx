'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resetPassword } from '@/lib/actions/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPassword, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-fluid-h2 font-bold text-foreground">إعادة تعيين كلمة المرور</h1>
          <p className="text-muted-foreground mt-2">
            أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="reset-email" className="block text-sm font-medium text-foreground">
              البريد الإلكتروني
            </label>
            <Input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-describedby={state?.message ? 'reset-message' : undefined}
              placeholder="email@example.com"
            />
          </div>

          {state?.message && (
            <p
              id="reset-message"
              role="alert"
              className={`text-sm text-center ${state.message.includes('تم إرسال') ? 'text-success' : 'text-destructive'}`}
            >
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/auth/login" className="text-sm text-primary hover:underline cursor-pointer">
            العودة إلى تسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
