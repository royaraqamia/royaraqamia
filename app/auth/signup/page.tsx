'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CircleAlert, User, Mail, LockKeyhole } from 'lucide-react';
import { GoogleLogo } from '@/frontend/ui/auth/GoogleLogo';
import { signup, signInWithGoogle } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/primitives/input';
import { Button } from '@/frontend/ui/primitives/button';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { PasswordStrength } from '@/frontend/ui/auth/PasswordStrength';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { AuthDivider } from '@/frontend/ui/auth/AuthDivider';
import { Turnstile } from '@/frontend/ui/auth/Turnstile';

export default function SignupPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsPending(true);
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
      setMessage(result.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto antialiased">
      <AuthCard title="إنشاء حساب">
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="space-y-4 sm:space-y-5">
            {/* Full Name Input Group */}
            <div className="space-y-1.5">
              <label
                htmlFor="signup-name"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/90 select-none"
              >
                <User size={15} className="text-muted-foreground/80 shrink-0" aria-hidden="true" />
                <span>الاسم الكامل</span>
                <span className="text-destructive font-bold select-none" aria-hidden="true">
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
                className="w-full h-11 px-3.5 rounded-xl border border-border/60 bg-background/50 hover:border-border hover:bg-background/80 focus:bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 text-sm placeholder:text-muted-foreground/50 shadow-xs focus-visible:outline-none"
              />
            </div>

            {/* Email Input Group */}
            <div className="space-y-1.5">
              <label
                htmlFor="signup-email"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/90 select-none"
              >
                <Mail
                  size={15}
                  className="text-muted-foreground/80 shrink-0"
                  aria-hidden="true"
                />
                <span>البريد الإلكتروني</span>
                <span className="text-destructive font-bold select-none" aria-hidden="true">
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
                className="w-full h-11 px-3.5 rounded-xl border border-border/60 bg-background/50 hover:border-border hover:bg-background/80 focus:bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 text-sm placeholder:text-muted-foreground/50 shadow-xs focus-visible:outline-none"
              />
            </div>

            {/* Password Input Group */}
            <div className="space-y-1.5">
              <label
                htmlFor="signup-password"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/90 select-none"
              >
                <LockKeyhole
                  size={15}
                  className="text-muted-foreground/80 shrink-0"
                  aria-hidden="true"
                />
                <span>كلمة المرور</span>
                <span className="text-destructive font-bold select-none" aria-hidden="true">
                  *
                </span>
              </label>
              <PasswordInput
                id="signup-password"
                name="password"
                autoComplete="new-password"
                onChange={setPassword}
                aria-describedby={message ? 'signup-error' : undefined}
                className="w-full h-11 rounded-xl border border-border/60 bg-background/50 hover:border-border hover:bg-background/80 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-200 shadow-xs"
              />
              <PasswordStrength password={password} />
            </div>
          </div>

          {/* Styled Turnstile Security Container */}
          <div className="flex justify-center items-center p-2.5 rounded-xl bg-muted/20 border border-border/40 backdrop-blur-xs min-h-17 overflow-hidden shadow-xs hover:border-border/60 transition-colors duration-200">
            <Turnstile onToken={setTurnstileToken} />
          </div>

          <input type="hidden" name="cf-turnstile-response" value={turnstileToken ?? ''} />

          {/* Animated Error Alert */}
          <AnimatePresence mode="wait">
            {message && (
              <motion.div
                key="signup-error-alert"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive shadow-xs backdrop-blur-xs"
              >
                <CircleAlert
                  size={20}
                  className="shrink-0 mt-0.5 text-destructive"
                  aria-hidden="true"
                />
                <p id="signup-error" role="alert" className="text-sm font-medium leading-relaxed">
                  {message}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary Action Button */}
          <Button
            type="submit"
            isLoading={isPending}
            className="w-full h-11 sm:h-12 rounded-full font-medium gradient-primary text-white cta-glow shadow-md hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isPending ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
          </Button>
        </form>

        <div className="my-5 sm:my-6">
          <AuthDivider />
        </div>

        {/* Secondary Google Auth Section */}
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
            className="w-full h-11 sm:h-12 rounded-full font-medium border border-border/80 bg-background hover:bg-muted/50 hover:border-border hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ease-out flex items-center justify-center gap-2.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            <GoogleLogo size={20} className="shrink-0" />
            <span>{googleLoading ? 'جارٍ الاتِّصال بـ Google...' : 'التَّسجيل بحساب Google'}</span>
          </Button>

          <AnimatePresence mode="wait">
            {googleError && (
              <motion.div
                key="google-error-alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-center"
              >
                <p role="alert" className="text-sm font-medium text-destructive">
                  {googleError}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation Link */}
        <p className="text-center text-sm text-muted-foreground mt-6 sm:mt-7">
          لديك حساب بالفعل؟{' '}
          <Link
            href="/auth/login"
            className="text-primary font-semibold hover:text-primary/80 underline-offset-4 hover:underline transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md px-1 py-0.5"
          >
            تسجيل الدُّخول
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
