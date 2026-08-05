'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { WarningCircle, CheckCircle, ArrowLeft } from '@phosphor-icons/react';
import { resetPassword } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/primitives/input';
import { Button } from '@/frontend/ui/primitives/button';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

const isSuccessMessage = (msg: string) => msg.includes('تم إرسال');

export default function ResetPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await resetPassword(formData.get('email') as string);
      setMessage(result.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AuthCard
      title="إعادة تعيين كلمة المرور"
      description="أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
            aria-describedby={message ? 'reset-message' : undefined}
          />
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-2.5 p-3 rounded-lg border ${
              isSuccessMessage(message)
                ? 'bg-success/10 border-success/20'
                : 'bg-destructive/10 border-destructive/20'
            }`}
          >
            {isSuccessMessage(message) ? (
              <CheckCircle size={18} className="shrink-0 mt-0.5 text-success" />
            ) : (
              <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
            )}
            <p
              id="reset-message"
              role="alert"
              className={`text-sm ${
                isSuccessMessage(message) ? 'text-success' : 'text-destructive'
              }`}
            >
              {message}
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
