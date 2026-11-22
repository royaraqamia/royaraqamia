'use client';

import { Suspense, useReducer, useState, lazy } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CircleAlert, User, Mail, LockKeyhole, Loader2 } from 'lucide-react';
import { signup } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/primitives/input';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { AuthDivider } from '@/frontend/ui/auth/AuthDivider';
import { GoogleAuthButton } from '@/frontend/ui/auth/GoogleAuthButton';
import { SIGN_IN_COPY } from '../login/sign-in-copy';
import { authLink } from '@/frontend/ui/auth/auth-links';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { authSubmitReducer, INITIAL_AUTH_SUBMIT } from '../auth-submit.reducer';

const PasswordStrength = lazy(
  tolerateChunkFailure('password strength meter', () =>
    import('@/frontend/ui/auth/PasswordStrength').then((m) => ({ default: m.PasswordStrength }))
  )
);
const Turnstile = lazy(
  tolerateChunkFailure('Turnstile', () =>
    import('@/frontend/ui/shared/turnstile').then((m) => ({ default: m.Turnstile }))
  )
);

function SignupForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [{ message, offline, pending: isPending }, dispatch] = useReducer(
    authSubmitReducer,
    INITIAL_AUTH_SUBMIT
  );
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  /** The email form is the second door: it opens when the visitor asks for it. */
  const [emailOpen, setEmailOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: 'submitStarted' });
    try {
      const formData = new FormData(event.currentTarget);
      const result = await signup({
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        redirectTo: formData.get('redirectTo') as string | null,
        turnstileToken: (formData.get('cf-turnstile-response') as string) || '',
      });
      if (result.ok) {
        window.location.assign(result.redirectUrl);
        return;
      }
      dispatch({ type: 'submitAnswered', message: result.message, offline: result.offline });
    } finally {
      dispatch({ type: 'submitSettled' });
    }
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-md antialiased">
      <AuthCard title="إنشاء حساب">
        {/* The same Google button as the sign-in page, because it is the same
            action: a first Google use creates the account, a later one returns
            to it, and the visitor never sees a second Google door. */}
        <GoogleAuthButton
          redirectTo={redirectTo}
          label={SIGN_IN_COPY.google}
          busyLabel={SIGN_IN_COPY.googleBusy}
        />

        <div className="my-5 sm:my-6">
          <AuthDivider />
        </div>

        {emailOpen ? (
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div className="space-y-4 sm:space-y-5">
              {/* Full Name Input Group */}
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-name"
                  className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-foreground/90 uppercase select-none"
                >
                  <User
                    size={15}
                    className="shrink-0 text-muted-foreground/80"
                    aria-hidden="true"
                  />
                  <span>الاسم الكامل</span>
                  <span className="font-bold text-destructive select-none" aria-hidden="true">
                    *
                  </span>
                </label>
                <Input
                  id="signup-name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="الاسم الكامل"
                  aria-describedby={message ? 'signup-error' : undefined}
                  className="h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3.5 text-sm shadow-xs transition-safe duration-200 placeholder:text-muted-foreground/50 hover:border-border hover:bg-background/80 focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 focus-visible:outline-none"
                />
              </div>

              {/* Email Input Group */}
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-email"
                  className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-foreground/90 uppercase select-none"
                >
                  <Mail
                    size={15}
                    className="shrink-0 text-muted-foreground/80"
                    aria-hidden="true"
                  />
                  <span>البريد الإلكتروني</span>
                  <span className="font-bold text-destructive select-none" aria-hidden="true">
                    *
                  </span>
                </label>
                <Input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="example@email.com"
                  aria-describedby={message ? 'signup-error' : undefined}
                  className="h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3.5 text-sm shadow-xs transition-safe duration-200 placeholder:text-muted-foreground/50 hover:border-border hover:bg-background/80 focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 focus-visible:outline-none"
                />
              </div>

              {/* Password Input Group */}
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-password"
                  className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-foreground/90 uppercase select-none"
                >
                  <LockKeyhole
                    size={15}
                    className="shrink-0 text-muted-foreground/80"
                    aria-hidden="true"
                  />
                  <span>كلمة المرور</span>
                  <span className="font-bold text-destructive select-none" aria-hidden="true">
                    *
                  </span>
                </label>
                <PasswordInput
                  id="signup-password"
                  name="password"
                  autoComplete="new-password"
                  onChange={setPassword}
                  aria-describedby={message ? 'signup-error' : undefined}
                  className="h-11 w-full rounded-xl border border-border/60 bg-background/50 shadow-xs transition-safe duration-200 hover:border-border hover:bg-background/80"
                />
                <PasswordStrength password={password} />
              </div>
            </div>

            {/* Styled Turnstile Security Container */}
            <div className="flex min-h-17 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-muted/20 p-2.5 shadow-xs transition-colors duration-200 hover:border-border/60">
              <Turnstile onToken={setTurnstileToken} />
            </div>

            <input type="hidden" name="cf-turnstile-response" value={turnstileToken ?? ''} />

            {/* Animated Error Alert */}
            {offline ? (
              <NeedsConnection
                variant="inline"
                message="لم يصل طلب إنشاء الحساب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
              />
            ) : (
              message && (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-destructive shadow-xs">
                  <CircleAlert
                    size={20}
                    className="mt-0.5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p id="signup-error" role="alert" className="text-sm font-medium leading-relaxed">
                    {message}
                  </p>
                </div>
              )
            )}

            {/* Primary Action Button */}
            <HeroCtaButton type="submit" disabled={isPending} className="w-full">
              {isPending ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                  <span>جاري إنشاء الحساب...</span>
                </>
              ) : (
                'إنشاء حساب'
              )}
            </HeroCtaButton>
          </form>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              className="link-underline rounded-xs text-xs font-bold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none sm:text-sm"
            >
              إنشاء حساب بالبريد الإلكتروني
            </button>
          </div>
        )}

        {/* Footer Navigation Link */}
        <p className="mt-6 text-center text-sm text-muted-foreground sm:mt-7">
          لديك حساب بالفعل؟{' '}
          <Link
            href={authLink('/auth/login', redirectTo)}
            className="rounded-md px-1 py-0.5 font-bold text-primary underline-offset-4 transition-safe duration-150 hover:text-primary/80 hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            تسجيل الدُّخول
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
