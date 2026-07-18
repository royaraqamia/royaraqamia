'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { signup, login, verifyOtp, resendOtp, signInWithGoogle } from '@/lib/actions/auth';
import { OtpInput } from '@/components/shared/otp-input';

type AuthStep = 'credentials' | 'otp';

export function AuthForm({ mode }: { mode?: 'login' | 'signup' }) {
  const [isSignUp, setIsSignUp] = useState(
    mode === 'signup' ? true : mode === 'login' ? false : false
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<AuthStep>('credentials');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const passwordRef = useRef(password);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    passwordRef.current = password;
  }, [password]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const runSafely = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      return result;
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
        setError(e.message || 'حدث خطأ غير متوقع');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
        setError(e.message || 'حدث خطأ غير متوقع');
      }
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    if (isSignUp) formData.append('name', name);
    formData.append('email', email);
    formData.append('password', password);

    const result = await runSafely(() => (isSignUp ? signup : login)(null, formData));
    if (
      result &&
      'needsOtp' in result &&
      result.needsOtp &&
      'email' in result &&
      (result as Record<string, unknown>).email
    ) {
      setStep('otp');
      if (result.message) {
        setMessage(result.message);
      }
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    setOtpLoading(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('otp', otp);
      formData.append('password', passwordRef.current);

      const result = await verifyOtp(null, formData);
      if (result && 'message' in result && result.message) {
        setOtpValue('');
        setError(result.message ?? null);
        setOtpLoading(false);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
        setError(e.message || 'حدث خطأ غير متوقع');
      }
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpLoading(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('email', email);
      const result = await resendOtp(null, formData);
      if (result && 'message' in result && !('success' in result)) {
        setError(result.message ?? null);
      } else if (result && 'success' in result) {
        setMessage(result.message ?? null);
      }
      startCooldown();
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
        setError(e.message || 'حدث خطأ غير متوقع');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const getPasswordStrength = (pwd: string): { label: string; color: string; width: string } => {
    if (!pwd) return { label: '', color: '', width: '0%' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { label: 'ضعيف', color: 'bg-red-500', width: '20%' };
    if (score <= 2) return { label: 'متوسط', color: 'bg-amber-500', width: '40%' };
    if (score <= 3) return { label: 'جيد', color: 'bg-indigo-500', width: '65%' };
    return { label: 'قوي', color: 'bg-emerald-500', width: '100%' };
  };

  const passwordStrength = getPasswordStrength(password);

  if (step === 'otp') {
    return (
      <div className="w-full bg-white dark:bg-card p-8 rounded-3xl border border-border dark:border-border shadow-xl shadow-slate-100/50 dark:shadow-slate-900/50">
        <div className="mb-6 text-center">
          <button
            onClick={() => setStep('credentials')}
            className="float-right text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground transition-colors cursor-pointer press-scale flex items-center gap-1"
            type="button"
            aria-label="العودة إلى تسجيل الدخول"
          >
            <ArrowLeft aria-hidden="true" className="w-5 h-5" />
          </button>
          <h3 className="text-xl font-display font-bold text-foreground dark:text-foreground">
            تأكيد البريد الإلكتروني
          </h3>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1" dir="ltr">
            {email}
          </p>
          <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
            أدخل رمز التحقق المكون من 6 أرقام
          </p>
        </div>

        <div className="space-y-5">
          <OtpInput
            length={6}
            disabled={otpLoading}
            value={otpValue}
            onChange={(val) => {
              setOtpValue(val);
              if (val.length === 6) handleVerifyOtp(val);
            }}
          />

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="otp-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                aria-live="polite"
                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg font-medium text-center"
              >
                {error}
              </motion.div>
            )}
            {message && (
              <motion.div
                key="otp-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                aria-live="polite"
                className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs rounded-lg text-center"
              >
                {message}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => handleVerifyOtp(otpValue)}
            disabled={otpLoading || otpValue.length < 6}
            className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-primary/10 hover:shadow-primary/20 flex items-center justify-center gap-2 disabled:bg-primary/50 disabled:shadow-none cursor-pointer press-scale"
          >
            {otpLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" role="status" />
            ) : (
              'تأكيد الرمز'
            )}
          </button>

          <div className="text-center">
            <button
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || otpLoading}
              type="button"
              className="text-xs text-primary hover:text-primary font-semibold underline disabled:text-muted-foreground disabled:no-underline cursor-pointer press-opacity"
            >
              {resendCooldown > 0
                ? `إعادة إرسال الرمز بعد ${resendCooldown} ثانية`
                : 'إعادة إرسال الرمز'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-card p-8 rounded-3xl border border-border dark:border-border shadow-xl shadow-slate-100/50 dark:shadow-slate-900/50">
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <div>
            <label
              htmlFor="auth-name"
              className="block text-xs font-semibold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-2"
            >
              الاسم الكامل
            </label>
            <div className="relative">
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="محمد أحمد"
                className="w-full pr-4 py-3 bg-muted/50 dark:bg-background/50 border border-border dark:border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground dark:text-foreground"
              />
            </div>
          </div>
        )}
        <div>
          <label
            htmlFor="auth-email"
            className="block text-xs font-semibold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-2"
          >
            البريد الإلكتروني
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              className="w-full pl-11 pr-4 py-3 bg-muted/50 dark:bg-background/50 border border-border dark:border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground dark:text-foreground"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="auth-password"
            className="block text-xs font-semibold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-2"
          >
            كلمة المرور
          </label>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              className="w-full pl-11 pr-12 py-3 bg-muted/50 dark:bg-background/50 border border-border dark:border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground dark:text-foreground"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground transition-colors cursor-pointer"
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="w-4 h-4" />
              ) : (
                <Eye aria-hidden="true" className="w-4 h-4" />
              )}
            </button>
          </div>
          {isSignUp && password && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 bg-muted dark:bg-card rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                  style={{ width: passwordStrength.width }}
                />
              </div>
              <p
                className={`text-[10px] font-medium ${passwordStrength.color.replace('bg-', 'text-')}`}
              >
                قوة كلمة المرور: {passwordStrength.label}
              </p>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="credentials-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              aria-live="polite"
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg font-medium"
            >
              {error}
            </motion.div>
          )}
          {message && (
            <motion.div
              key="credentials-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              aria-live="polite"
              className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs rounded-lg text-center"
            >
              {message}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-primary/10 hover:shadow-primary/20 flex items-center justify-center gap-2 disabled:bg-primary/50 disabled:shadow-none cursor-pointer press-scale"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" role="status" />
          ) : (
            <>
              <span>{isSignUp ? 'إنشاء حساب' : 'تسجيل الدُّخول'}</span>
              <ArrowLeft aria-hidden="true" className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border dark:border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white dark:bg-card px-3 text-muted-foreground font-medium">أو</span>
        </div>
      </div>

      <button
        type="button"
        disabled={googleLoading}
        onClick={handleGoogleSignIn}
        className="w-full py-3 px-4 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-xl transition-all border border-slate-200 dark:border-slate-600 shadow-sm hover:shadow-md flex items-center justify-center gap-3 disabled:opacity-50 disabled:shadow-none cursor-pointer press-scale"
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" role="status" />
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
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
        )}
        <span>المتابعة عبر Google</span>
      </button>

      {!mode && (
        <div className="pt-6 border-t border-slate-100 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-500">
            {isSignUp ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setMessage(null);
              }}
              className="mr-1.5 text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer press-opacity"
            >
              {isSignUp ? 'تسجيل الدُّخول' : 'إنشاء حساب'}
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
