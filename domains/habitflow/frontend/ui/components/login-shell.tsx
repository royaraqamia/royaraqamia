'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState } from 'react';
import { login, signup } from '@/lib/actions/auth';
import { SignupSchema, LoginSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GoogleAuthButton from './google-auth-button';
import OtpVerifyStep from './otp-verify-step';
import type { z } from 'zod';

type SignupFormData = z.infer<typeof SignupSchema>;
type LoginFormData = z.infer<typeof LoginSchema>;

function AlertBox({ type, message }: { type: 'error' | 'success'; message: string }) {
  const styles =
    type === 'error'
      ? 'bg-destructive/10 text-destructive border-destructive/20'
      : 'bg-primary/10 text-primary border-primary/20';

  return (
    <div role="alert" className={`mb-6 p-4 text-sm rounded-xl border ${styles}`}>
      <div className="flex items-start gap-3">
        {type === 'error' ? (
          <svg
            className="w-5 h-5 shrink-0 mt-1"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 shrink-0 mt-1"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

export function LoginShell({ mode }: { mode?: 'login' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [isLogin, setIsLogin] = useState(mode !== 'signup');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpPassword, setOtpPassword] = useState('');
  const [otpState, otpAction, otpPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const { verifyOtp } = await import('@/lib/actions/auth');
      return verifyOtp(null, formData);
    },
    undefined
  );
  const [resendState, resendAction] = useActionState(async (_prev: unknown, formData: FormData) => {
    const { resendOtp } = await import('@/lib/actions/auth');
    return resendOtp(null, formData);
  }, undefined);

  const schema = isLogin ? LoginSchema : SignupSchema;
  const {
    register,
    formState: { errors },
    watch,
    reset,
  } = useForm<SignupFormData | LoginFormData>({
    resolver: zodResolver(schema),
  });

  const [authState, authAction, authPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const pwd = formData.get('password');
      if (typeof pwd === 'string') {
        passwordRef.current = pwd;
      }
      const fn = isLogin ? login : signup;
      return fn(null, formData);
    },
    undefined
  );

  const passwordValue = (watch('password') as string) || '';
  const passwordRef = useRef('');

  useEffect(() => {
    if (
      authState &&
      typeof authState === 'object' &&
      'needsOtp' in authState &&
      authState.needsOtp &&
      'email' in authState
    ) {
      setOtpEmail((authState as Record<string, unknown>).email as string);
      setOtpPassword(passwordRef.current);
      setStep('verify');
    }
  }, [authState]);

  useEffect(() => {
    reset();
  }, [isLogin, reset]);

  const getPasswordStrength = (pwd: string): { label: string; color: string; width: string } => {
    if (!pwd) return { label: '', color: '', width: '0%' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { label: 'ضعيف', color: 'bg-destructive', width: '20%' };
    if (score <= 2) return { label: 'متوسط', color: 'bg-amber-500', width: '40%' };
    if (score <= 3) return { label: 'جيد', color: 'bg-primary', width: '65%' };
    return { label: 'قوي', color: 'bg-emerald-500', width: '100%' };
  };

  const passwordStrength = getPasswordStrength(passwordValue);

  function handleVerifyOtp(otp: string) {
    const formData = new FormData();
    formData.append('email', otpEmail);
    formData.append('otp', otp);
    formData.append('password', otpPassword);
    otpAction(formData);
  }

  function handleResendOtp() {
    const formData = new FormData();
    formData.append('email', otpEmail);
    resendAction(formData);
  }

  function handleBackToForm() {
    setStep('form');
    passwordRef.current = '';
  }

  function toggleAuthMode() {
    setIsLogin((prev) => !prev);
  }

  const pending = authPending || otpPending;
  const serverError =
    authState && typeof authState === 'object' && 'error' in authState
      ? (authState as unknown as { error: string }).error
      : null;
  const serverMessage =
    authState && typeof authState === 'object' && 'message' in authState
      ? (authState as { message: string }).message
      : null;
  const otpErrorMessage =
    otpState && typeof otpState === 'object' && 'error' in otpState
      ? (otpState as unknown as { error: string }).error
      : null;
  const resendSuccessMessage =
    resendState &&
    typeof resendState === 'object' &&
    'success' in resendState &&
    (resendState as { message?: string }).message
      ? (resendState as { message: string }).message
      : null;

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-1 text-center">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {step === 'verify'
            ? 'أدخل رمز التَّحقُّق المُرسَل إلى بريدك الإلكتروني'
            : isLogin
              ? 'تسجيل الدخول'
              : 'إنشاء حساب'}
        </p>
      </div>

      {serverError && <AlertBox type="error" message={serverError} />}
      {serverMessage && <AlertBox type="error" message={serverMessage} />}
      {resendSuccessMessage && <AlertBox type="success" message={resendSuccessMessage} />}

      {step === 'form' && (
        <>
          <form action={authAction} className="space-y-6">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2" htmlFor="name">
                  الاسم الكامل
                </label>
                <Input
                  id="name"
                  type="text"
                  required
                  placeholder="محمد أحمد"
                  {...register('name')}
                />
                {!isLogin && 'name' in errors && errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="email">
                البريد الإلكتروني
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="البريد الإلكتروني"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="password">
                كلمة المرور
              </label>
              <Input
                id="password"
                type="password"
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="كلمة المرور"
                aria-describedby="password-hint"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
              )}
              {!isLogin && passwordValue ? (
                <div className="mt-2 space-y-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  <p
                    className={`text-xs font-medium ${passwordStrength.color.replace('bg-', 'text-')}`}
                  >
                    قوة كلمة المرور: {passwordStrength.label}
                  </p>
                </div>
              ) : (
                <p id="password-hint" className="mt-2 text-xs text-muted-foreground">
                  يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل
                </p>
              )}
            </div>

            <Button type="submit" disabled={pending} className="w-full py-3 h-auto">
              {pending
                ? isLogin
                  ? 'جارٍ تسجيل الدخول...'
                  : 'جارٍ إنشاء الحساب...'
                : isLogin
                  ? 'تسجيل الدُّخول'
                  : 'إنشاء حساب'}
            </Button>
          </form>

          {!mode && (
            <div className="mt-8 text-center space-y-4">
              <button
                onClick={toggleAuthMode}
                type="button"
                className="block w-full text-sm text-primary underline-offset-4 hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 py-2 min-h-[44px]"
              >
                {isLogin ? 'ليس لديك حساب؟ إنشاء حساب' : 'لديك حساب بالفعل؟ تسجيل الدُّخول'}
              </button>
            </div>
          )}
        </>
      )}

      {step === 'verify' && (
        <OtpVerifyStep
          email={otpEmail}
          loading={otpPending}
          successMessage={resendSuccessMessage}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          onBack={handleBackToForm}
        />
      )}

      {otpErrorMessage && <AlertBox type="error" message={otpErrorMessage} />}

      <div className="mt-6 relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">أو</span>
        </div>
      </div>

      <div className="mt-6">
        <GoogleAuthButton redirectTo={redirectTo} />
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="block w-full text-sm text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg py-2 min-h-[44px]"
        >
          ← العودة إلى التَّطبيق
        </Link>
      </div>
    </div>
  );
}
