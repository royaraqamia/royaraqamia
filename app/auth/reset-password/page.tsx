'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { WarningCircle, CheckCircle, ArrowLeft } from '@phosphor-icons/react';
import { resetPassword } from '@/backend/actions/auth';
import { Input } from '@/frontend/ui/ui/input';
import { Button } from '@/frontend/ui/ui/button';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

const isSuccessMessage = (msg: string) => msg.includes('تم إرسال');

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPassword, null);

  return (
    <AuthCard
      title="إعادة تعيين كلمة المرور"
      description="أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين"
    >
      <form action={formAction} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="reset-email" className="block text-sm font-medium text-foreground">
            البريد الإلكتروني
          </label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="example@email.com"
            aria-describedby={state?.message ? 'reset-message' : undefined}
          />
        </div>

        {state?.message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-2.5 p-3 rounded-lg border ${
              isSuccessMessage(state.message)
                ? 'bg-success/10 border-success/20'
                : 'bg-destructive/10 border-destructive/20'
            }`}
          >
            {isSuccessMessage(state.message) ? (
              <CheckCircle size={18} className="shrink-0 mt-0.5 text-success" />
            ) : (
              <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
            )}
            <p
              id="reset-message"
              role="alert"
              className={`text-sm ${
                isSuccessMessage(state.message) ? 'text-success' : 'text-destructive'
              }`}
            >
              {state.message}
            </p>
          </motion.div>
        )}

        <Button
          type="submit"
          isLoading={isPending}
          className="w-full h-12 gradient-primary text-white cta-glow"
        >
          {isPending ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
        </Button>
      </form>

      <div className="flex justify-center mt-6">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    </AuthCard>
  );
}
