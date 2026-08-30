'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { m } from 'motion/react';
import { CircleAlert } from 'lucide-react';
import { GoogleLogo } from '@/frontend/ui/auth/GoogleLogo';
import { login, signInWithGoogle } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/primitives/input';
import { Button } from '@/frontend/ui/primitives/button';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { AuthDivider } from '@/frontend/ui/auth/AuthDivider';
import { Turnstile } from '@/frontend/ui/auth/Turnstile';
import { authLink } from '@/frontend/ui/auth/auth-links';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const sessionExpired = searchParams.get('session_expired') === '1';
  const [message, setMessage] = useState<string | null>(
    sessionExpired ? 'انتهت صلاحيَّة الجلسة. يُرجَى تسجيل الدُّخول مرَّة أخرى.' : null
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
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-4 sm:space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="login-email"
              className="block text-xs sm:text-sm font-medium text-foreground/90 transition-colors cursor-pointer select-none"
            >
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
              className="w-full h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border border-border/70 bg-background/50 text-sm transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary hover:border-border"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="login-password"
              className="block text-xs sm:text-sm font-medium text-foreground/90 transition-colors cursor-pointer select-none"
            >
              كلمة المرور
            </label>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              aria-describedby={message ? 'login-error' : undefined}
              className="w-full h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border border-border/70 bg-background/50 text-sm transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary hover:border-border"
            />
          </div>
        </div>

        <div className="w-full flex justify-center my-1 sm:my-2 overflow-x-auto py-1">
          <Turnstile onToken={setTurnstileToken} />
        </div>

        <input type="hidden" name="cf-turnstile-response" value={turnstileToken ?? ''} />

        {message && (
          <m.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive shadow-xs backdrop-blur-xs select-none"
          >
            <CircleAlert size={18} className="shrink-0 mt-0.5 text-destructive" />
            <p
              id="login-error"
              role="alert"
              className="text-xs sm:text-sm font-medium leading-relaxed"
            >
              {message}
            </p>
          </m.div>
        )}

        <Button
          type="submit"
          isLoading={isPending}
          className="w-full h-11 sm:h-12 rounded-full font-medium text-sm sm:text-base gradient-primary text-white cta-glow transition-all duration-300 ease-out hover:scale-[1.01] active:scale-[0.985] shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer select-none"
        >
          {isPending ? 'جاري الدُّخول...' : 'تسجيل الدُّخول'}
        </Button>
      </form>

      <div className="flex justify-center mt-3 sm:mt-4">
        <Link
          href={authLink('/auth/reset-password', redirectTo)}
          className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 link-underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xs"
        >
          نسيت كلمة المرور؟
        </Link>
      </div>

      <div className="my-5 sm:my-6">
        <AuthDivider />
      </div>

      <div className="space-y-2">
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
                setGoogleError('حدث خطأ أثناء الاتِّصال بـ Google. يُرجَى المحاولة لاحقًا');
              }
            } finally {
              setGoogleLoading(false);
            }
          }}
          className="w-full h-11 sm:h-12 rounded-full text-sm sm:text-base font-medium border border-border/80 bg-background/50 hover:bg-accent/80 hover:border-border text-foreground transition-all duration-300 ease-out hover:scale-[1.01] active:scale-[0.985] flex items-center justify-center gap-2.5 shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <GoogleLogo size={20} className="shrink-0" />
          <span>{googleLoading ? 'جارٍ الاتِّصال بـ Google...' : 'الدُّخول بحساب Google'}</span>
        </Button>

        {googleError && (
          <m.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-xs sm:text-sm text-destructive text-center font-medium mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            {googleError}
          </m.p>
        )}
      </div>

      <p className="text-center text-xs sm:text-sm text-muted-foreground mt-6 sm:mt-8 font-normal">
        ليس لديك حساب؟{' '}
        <Link
          href={authLink('/auth/signup', redirectTo)}
          className="text-primary font-bold hover:underline underline-offset-4 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xs"
        >
          إنشاء حساب
        </Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
