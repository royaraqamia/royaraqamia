'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import { signup, signInWithGoogle } from '@/lib/actions/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { Turnstile } from '@/components/auth/Turnstile';

export default function SignupPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [state, formAction, isPending] = useActionState(signup, null);
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  return (
    <AuthCard title="إنشاء حساب">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="signup-name" className="block text-sm font-medium text-foreground">
              الاسم الكامل
            </label>
            <Input
              id="signup-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="الاسم الكامل"
              aria-describedby={state?.message ? 'signup-error' : undefined}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-email" className="block text-sm font-medium text-foreground">
              البريد الإلكتروني
            </label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="example@email.com"
              aria-describedby={state?.message ? 'signup-error' : undefined}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-password" className="block text-sm font-medium text-foreground">
              كلمة المرور
            </label>
            <PasswordInput
              id="signup-password"
              name="password"
              autoComplete="new-password"
              onChange={setPassword}
              aria-describedby={state?.message ? 'signup-error' : undefined}
            />
            <PasswordStrength password={password} />
          </div>
        </div>

        <Turnstile onToken={setTurnstileToken} />

        <input type="hidden" name="cf-turnstile-response" value={turnstileToken ?? ''} />

        {state?.message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
            <p id="signup-error" role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          </motion.div>
        )}

        <Button
          type="submit"
          isLoading={isPending}
          className="w-full h-12 gradient-primary text-white cta-glow"
        >
          {isPending ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
        </Button>
      </form>

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
        {googleLoading ? 'جارٍ الاتصال بـ Google...' : 'التسجيل بحساب Google'}
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
        لديك حساب بالفعل؟{' '}
        <Link href="/auth/login" className="text-primary font-medium hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </AuthCard>
  );
}
