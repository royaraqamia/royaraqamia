'use client';

import { motion } from 'motion/react';
import { useMemo } from 'react';

interface PasswordStrengthProps {
  password: string;
}

function getStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'ضعيفة', color: 'bg-destructive' };
  if (score <= 2) return { score, label: 'متوسطة', color: 'bg-warning' };
  if (score <= 3) return { score, label: 'جيدة', color: 'bg-accent-indigo' };
  return { score, label: 'قوية', color: 'bg-success' };
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { score, label, color } = useMemo(() => getStrength(password), [password]);

  if (!password) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-1.5"
    >
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <motion.div
            key={i}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: i < score ? 1 : 0 }}
            transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className={`h-1 flex-1 rounded-full ${i < score ? color : 'bg-border'}`}
            style={{ transformOrigin: 'right' }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        قوة كلمة المرور: <span className="text-foreground font-medium">{label}</span>
      </p>
    </motion.div>
  );
}
