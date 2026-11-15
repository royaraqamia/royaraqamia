'use client';

import { Suspense, useState, lazy } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { login } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/primitives/input';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { GoogleAuthButton } from '@/frontend/ui/auth/GoogleAuthButton';
import { SIGN_IN_COPY } from './sign-in-copy';
import { AuthDivider } from '@/frontend/ui/auth/AuthDivider';
import { authLink } from '@/frontend/ui/auth/auth-links';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';

const Turnstile = lazy(
  tolerateChunkFailure('Turnstile', () =>
    import('@/frontend/ui/shared/turnstile').then((m) => ({ default: m.Turnstile }))
  )
);

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const sessionExpired = searchParams.get('session_expired') === '1';
  const oauthFailed = searchParams.get('error') === 'oauth_failed';
  const [pageNotice] = useState<string | null>(
    sessionExpired
      ? 'انتهت صلاحيَّة الجلسة. يُرجَى تسجيل الدُّخول مرَّة أخرى.'
      : oauthFailed
        ? 'فشل تسجيل الدُّخول عبر Google. يُرجَى المحاولة مرَّة أخرى.'
        : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  /** The email form is the second door: it opens when the visitor asks for it. */
  const [emailOpen, setEmailOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setOffline(false);
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
      // A refusal the server did not explain still reads as one: the fallback is
      // applied where the message is set, so the render never tests it again.
      setMessage(result.message || SIGN_IN_COPY.refused);
      setOffline(result.offline);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AuthCard title={SIGN_IN_COPY.title}>
      {pageNotice && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-destructive shadow-xs select-none">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-destructive" />
          <p
            id="login-error"
            role="alert"
            className="text-xs font-medium leading-relaxed sm:text-sm"
          >
            {pageNotice}
          </p>
        </div>
      )}

      {/* Priority one: one press, nothing to remember, and the same button on
          both auth pages because the provider treats sign-up and sign-in as one. */}
      <GoogleAuthButton
        redirectTo={redirectTo}
        label={SIGN_IN_COPY.google}
        busyLabel={SIGN_IN_COPY.googleBusy}
      />

      <div className="my-5 sm:my-6">
        <AuthDivider />
      </div>

      {emailOpen ? (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="login-email"
                className="block cursor-pointer select-none text-xs font-medium text-foreground/90 transition-colors sm:text-sm"
              >
                {SIGN_IN_COPY.email}
              </label>
              <Input
                id="login-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="example@email.com"
                aria-describedby={message ? 'login-error' : undefined}
                className="h-11 w-full rounded-xl border border-border/70 bg-background/50 px-3.5 text-sm transition-safe duration-200 placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:h-12 sm:px-4"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="login-password"
                className="block cursor-pointer select-none text-xs font-medium text-foreground/90 transition-colors sm:text-sm"
              >
                {SIGN_IN_COPY.password}
              </label>
              <PasswordInput
                id="login-password"
                name="password"
                autoComplete="current-password"
                aria-describedby={message ? 'login-error' : undefined}
                className="h-11 w-full rounded-xl border border-border/70 bg-background/50 px-3.5 text-sm transition-safe duration-200 placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:h-12 sm:px-4"
              />
            </div>
          </div>

          <div className="my-1 flex w-full justify-center overflow-x-auto py-1 sm:my-2">
            <Turnstile onToken={setTurnstileToken} />
          </div>

          <input type="hidden" name="cf-turnstile-response" value={turnstileToken ?? ''} />

          {offline ? (
            <NeedsConnection variant="inline" message={SIGN_IN_COPY.unreachable} />
          ) : (
            message && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-destructive shadow-xs select-none">
                <CircleAlert size={18} className="mt-0.5 shrink-0 text-destructive" />
                <p
                  id="login-error"
                  role="alert"
                  className="text-xs font-medium leading-relaxed sm:text-sm"
                >
                  {message}
                </p>
              </div>
            )
          )}

          <HeroCtaButton type="submit" disabled={isPending} className="w-full">
            {isPending ? (
              <>
                <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                <span>{SIGN_IN_COPY.busy}</span>
              </>
            ) : (
              SIGN_IN_COPY.submit
            )}
          </HeroCtaButton>

          <div className="flex justify-center">
            <Link
              href={authLink('/auth/reset-password', redirectTo)}
              className="link-underline rounded-xs text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none sm:text-sm"
            >
              نسيت كلمة المرور؟
            </Link>
          </div>
        </form>
      ) : (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            className="link-underline rounded-xs text-xs font-bold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none sm:text-sm"
          >
            {SIGN_IN_COPY.emailToggle}
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-xs font-normal text-muted-foreground sm:mt-8 sm:text-sm">
        ليس لديك حساب؟{' '}
        <Link
          href={authLink('/auth/signup', redirectTo)}
          className="font-bold text-primary underline-offset-4 transition-colors duration-200 hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
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
