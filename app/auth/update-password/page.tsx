'use client';

import { Suspense, useState, lazy } from 'react';
import { useSearchParams } from 'next/navigation';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { updatePassword } from '@/frontend/api/auth';
import { Button } from '@/frontend/ui/primitives/button';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

const PasswordStrength = lazy(() =>
  import('@/frontend/ui/auth/PasswordStrength').then((m) => ({ default: m.PasswordStrength }))
);

function UpdatePasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const doPasswordsMatch = password && confirmPassword && password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !doPasswordsMatch;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await updatePassword({
        password: formData.get('password') as string,
        confirmPassword: formData.get('confirmPassword') as string,
        token,
        email,
        redirectTo: formData.get('redirectTo') as string | null,
      });
      if (result.ok) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setMessage(result.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary overflow-hidden"
    >
      <div className="w-full max-w-md mx-auto relative z-10">
        <AuthCard
          title="كلمة مرور جديدة"
          description="أدخِل كلمة المرور الجديدة التي ترغب في تعيينها"
        >
          <form onSubmit={handleSubmit} className="space-y-6 mt-2" noValidate>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="email" value={email} />

            <div className="space-y-5">
              {/* Password Input Group */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="update-password"
                    className="form-label text-sm font-medium text-foreground/90 select-none flex items-center gap-1.5"
                  >
                    كلمة المرور الجديدة
                  </label>
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
                    مطلوب
                  </span>
                </div>

                <div className="relative">
                  <PasswordInput
                    id="update-password"
                    name="password"
                    autoComplete="new-password"
                    onChange={setPassword}
                    className="w-full transition-safe duration-200 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </div>

                <PasswordStrength password={password} />
              </div>

              {/* Confirm Password Input Group */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="confirm-password"
                    className="form-label text-sm font-medium text-foreground/90 select-none"
                  >
                    تأكيد كلمة المرور
                  </label>

                  {doPasswordsMatch && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                      <CircleCheck
                        size={13}
                        fill="currentColor"
                        className="shrink-0 text-emerald-500"
                      />
                      <span>متطابقة</span>
                    </span>
                  )}
                </div>

                <div className="relative">
                  <PasswordInput
                    id="confirm-password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    error={showMismatch}
                    onChange={setConfirmPassword}
                    className="w-full transition-safe duration-200 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </div>

                {showMismatch && (
                  <p
                    className="text-xs font-medium text-destructive flex items-center gap-1.5 pt-0.5"
                    role="alert"
                  >
                    <CircleAlert size={14} className="shrink-0" aria-hidden="true" />
                    <span>كلمة المرور غير متطابقة</span>
                  </p>
                )}
              </div>
            </div>

            {/* Server Error / API Response Message Banner */}
            {message && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive shadow-sm">
                <CircleAlert
                  size={20}
                  className="shrink-0 mt-0.5 text-destructive"
                  aria-hidden="true"
                />
                <p role="alert" className="text-sm font-medium leading-relaxed">
                  {message}
                </p>
              </div>
            )}

            {/* Submit Action Button */}
            <Button
              type="submit"
              isLoading={isPending}
              disabled={showMismatch}
              className="w-full h-12 text-sm font-bold text-white gradient-primary rounded-full shadow-md transition-safe duration-300 ease-out hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
            >
              {isPending ? 'جاري التَّحديث...' : 'تحديث كلمة المرور'}
            </Button>
          </form>
        </AuthCard>
      </div>
    </main>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordForm />
    </Suspense>
  );
}
