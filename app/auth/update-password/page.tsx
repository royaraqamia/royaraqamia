'use client';

import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { WarningCircle } from '@phosphor-icons/react';
import { updatePassword } from '@/backend/actions/auth';
import { Button } from '@/frontend/ui/ui/button';
import { PasswordInput } from '@/frontend/ui/auth/PasswordInput';
import { PasswordStrength } from '@/frontend/ui/auth/PasswordStrength';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

export default function UpdatePasswordPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [state, formAction, isPending] = useActionState(updatePassword, null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const doPasswordsMatch = password && confirmPassword && password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !doPasswordsMatch;

  return (
    <AuthCard title="كلمة مرور جديدة" description="أدخل كلمة المرور الجديدة التي ترغب في تعيينها">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="update-password"
              className="form-label block text-sm font-medium text-foreground"
            >
              كلمة المرور الجديدة
            </label>
            <PasswordInput
              id="update-password"
              name="password"
              autoComplete="new-password"
              onChange={setPassword}
            />
            <PasswordStrength password={password} />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirm-password"
              className="form-label block text-sm font-medium text-foreground"
            >
              تأكيد كلمة المرور
            </label>
            <PasswordInput
              id="confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              error={showMismatch}
              onChange={setConfirmPassword}
            />
            {showMismatch && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-destructive"
              >
                كلمة المرور غير متطابقة
              </motion.p>
            )}
          </div>
        </div>

        {state?.message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <WarningCircle size={18} className="shrink-0 mt-0.5 text-destructive" />
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          </motion.div>
        )}

        <Button
          type="submit"
          isLoading={isPending}
          disabled={showMismatch}
          className="w-full h-12 gradient-primary text-white cta-glow"
        >
          {isPending ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
        </Button>
      </form>
    </AuthCard>
  );
}
