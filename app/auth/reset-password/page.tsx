'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resetPassword } from '@/lib/actions/auth';

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPassword, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">إعادة تعيين كلمة المرور</h1>
          <p className="text-muted-foreground mt-2">
            أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              البريد الإلكتروني
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full px-4 py-3 rounded-xl border border-border bg-white/5 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              placeholder="email@example.com"
            />
          </div>

          {state?.message && (
            <p
              className={`text-sm text-center ${state.message.includes('تم إرسال') ? 'text-green-500' : 'text-destructive'}`}
            >
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
          </button>
        </form>

        <div className="text-center">
          <Link href="/auth/login" className="text-sm text-primary hover:underline">
            العودة إلى تسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
