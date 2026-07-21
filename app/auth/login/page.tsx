'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { login, signInWithGoogle } from '@/lib/actions/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-fluid-h2 font-bold text-foreground">تسجيل الدُّخول</h1>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
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
              aria-describedby={state?.message ? 'login-error' : undefined}
              placeholder="email@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
              كلمة المرور
            </label>
            <Input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-describedby={state?.message ? 'login-error' : undefined}
              placeholder="••••••••"
            />
          </div>

          {state?.message && (
            <p id="login-error" role="alert" className="text-sm text-destructive text-center">
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'جاري الدُّخول...' : 'تسجيل الدُّخول'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">أو</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => signInWithGoogle(redirectTo)}
          className="w-full"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          الدُّخول بحساب Google
        </Button>

        <div className="text-center space-y-2">
          <Link
            href="/auth/reset-password"
            className="text-sm text-muted-foreground hover:text-foreground block cursor-pointer transition-colors py-2"
          >
            نسيت كلمة المرور؟
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm text-primary hover:underline cursor-pointer py-2 block"
          >
            ليس لديك حساب؟ إنشاء حساب
          </Link>
        </div>
      </div>
    </div>
  );
}
