'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import { login, signInWithGoogle } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/ui/input';
import { Button } from '@/frontend/ui/ui/button';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { AuthDivider } from '@/frontend/ui/auth/AuthDivider';
import { Turnstile } from '@/frontend/ui/auth/Turnstile';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const sessionExpired = searchParams.get('session_expired') === '1';
  const [message, setMessage] = useState<string | null>(
    sessionExpired ? 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.' : null
  );
  const [isPending, setIsPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await login({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        redirectTo: formData.get('redirectTo') as string | null,
        turnstileToken: (formData.get('cf-turnstile-response') as string) || '',
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
    <AuthCard title="تسجيل الدُّخول">
      <form onSubmit={handleSubmit} className="space-y-5">
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
              aria-describedby={message ? 'login-error' : undefined}
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
              aria-describedby={message ? 'login-error' : undefined}
            />
          </div>
        </div>

        <Turnstile onToken={setTurnstileToken} />

        <input type="hidden" name="cf-turnstile-response" value={turnstileToken ?? ''} />

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
            <p id="login-error" role="alert" className="text-sm text-destructive">
              {message}
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
        isLoading={googleLoading}
        onClick={async () => {
          setGoogleLoading(true);
          setGoogleError(null);
          try {
            await signInWithGoogle(redirectTo);
          } catch (e) {
            if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
              setGoogleError('حدث خطأ أثناء الاتصال بـ Google. يرجى المحاولة لاحقاً');
            }
          } finally {
            setGoogleLoading(false);
          }
        }}
        className="w-full h-12"
      >
        <GoogleLogo size={20} weight="bold" />
        {googleLoading ? 'جارٍ الاتصال بـ Google...' : 'الدخول بحساب Google'}
      </Button>
      {googleError && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-destructive text-center mt-2"
        >
          {googleError}
        </motion.p>
      )}

      <p className="text-center text-sm text-muted-foreground mt-6">
        ليس لديك حساب؟{' '}
        <Link href="/auth/signup" className="text-primary font-medium hover:underline">
          إنشاء حساب
        </Link>
      </p>
    </AuthCard>
  );
}
