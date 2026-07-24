'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import { login, signInWithGoogle } from '@/lib/actions/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthDivider } from '@/components/auth/AuthDivider';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <AuthCard title="تسجيل الدُّخول">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="login-email" className="block text-sm font-medium text-foreground">
              البريد الإلكتروني
            </label>
            <Input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="example@email.com"
              aria-describedby={state?.message ? 'login-error' : undefined}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
              كلمة المرور
            </label>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              aria-describedby={state?.message ? 'login-error' : undefined}
            />
          </div>
        </div>

        {state?.message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
            <p id="login-error" role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          </motion.div>
        )}

        <Button
          type="submit"
          isLoading={isPending}
          className="w-full h-12 gradient-primary text-white cta-glow"
        >
          {isPending ? 'جاري الدخول...' : 'تسجيل الدخول'}
        </Button>
      </form>

      <div className="flex justify-center mt-4">
        <Link
          href="/auth/reset-password"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors link-underline"
        >
          نسيت كلمة المرور؟
        </Link>
      </div>

      <AuthDivider />

      <Button
        type="button"
        variant="outline"
        onClick={() => signInWithGoogle(redirectTo)}
        className="w-full h-12"
      >
        <GoogleLogo size={20} weight="bold" />
        الدخول بحساب Google
      </Button>

      <p className="text-center text-sm text-muted-foreground mt-6">
        ليس لديك حساب؟{' '}
        <Link href="/auth/signup" className="text-primary font-medium hover:underline">
          إنشاء حساب
        </Link>
      </p>
    </AuthCard>
  );
}
