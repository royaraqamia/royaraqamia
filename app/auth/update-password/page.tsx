'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { updatePassword } from '@/lib/actions/auth';

export default function UpdatePasswordPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [state, formAction, isPending] = useActionState(updatePassword, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">كلمة مرور جديدة</h1>
          <p className="text-muted-foreground mt-2">أدخل كلمة المرور الجديدة</p>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              كلمة المرور الجديدة
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-border bg-white/5 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              placeholder="8 أحرف على الأقل"
            />
          </div>

          {state?.message && (
            <p className="text-sm text-destructive text-center">{state.message}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
          </button>
        </form>
      </div>
    </div>
  );
}
