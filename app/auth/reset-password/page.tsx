'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CircleAlert, CircleCheck, ArrowLeft } from 'lucide-react';
import { resetPassword } from '@/frontend/api/auth';
import { Input } from '@/frontend/ui/primitives/input';
import { Button } from '@/frontend/ui/primitives/button';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';
import { authLink } from '@/frontend/ui/auth/auth-links';

const isSuccessMessage = (msg: string) => msg.includes('تمَّ إرسال');

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await resetPassword(formData.get('email') as string, redirectTo);
      setMessage(result.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AuthCard
      title="إعادة تعيين كلمة المرور"
      description="أدخِل بريدك الإلكتروني وسنُرسل لك رابطًا لإعادة التَّعيين"
    >
      <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
        <div className="space-y-2 text-start">
          <label
            htmlFor="reset-email"
            className="block text-sm font-medium text-foreground/90 tracking-tight select-none"
          >
            البريد الإلكتروني
          </label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="example@email.com"
            disabled={isPending}
            aria-describedby={message ? 'reset-message' : undefined}
            className="w-full h-11 px-3.5 text-sm bg-background/50 border-border/70 hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-200 rounded-xl placeholder:text-muted-foreground/50 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        <AnimatePresence mode="wait">
          {message && (
            <motion.div
              key="reset-message-alert"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-sm transition-all duration-200 ${
                isSuccessMessage(message)
                  ? 'bg-success/10 border-success/20 text-success shadow-sm shadow-success/5'
                  : 'bg-destructive/10 border-destructive/20 text-destructive shadow-sm shadow-destructive/5'
              }`}
            >
              {isSuccessMessage(message) ? (
                <CircleCheck size={20} className="shrink-0 mt-0.5 text-success" />
              ) : (
                <CircleAlert size={20} className="shrink-0 mt-0.5 text-destructive" />
              )}
              <p
                id="reset-message"
                role="alert"
                className={`text-sm font-medium leading-relaxed ${
                  isSuccessMessage(message) ? 'text-success' : 'text-destructive'
                }`}
              >
                {message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          type="submit"
          isLoading={isPending}
          disabled={isPending}
          className="w-full h-11 sm:h-12 font-semibold text-white gradient-primary cta-glow shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.99] transition-all duration-200 rounded-full disabled:opacity-70 disabled:pointer-events-none cursor-pointer"
        >
          {isPending ? 'جاري الإرسال...' : 'إرسال رابط إعادة التَّعيين'}
        </Button>
      </form>

      <div className="flex justify-center mt-6 pt-2 border-t border-border/40">
        <Link
          href={authLink('/auth/login', redirectTo)}
          className="group inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-200 ease-out py-1.5 px-3 rounded-lg hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <ArrowLeft
            size={16}
            className="shrink-0 transition-transform duration-200 group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1"
          />
          <span>العودة إلى تسجيل الدُّخول</span>
        </Link>
      </div>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
