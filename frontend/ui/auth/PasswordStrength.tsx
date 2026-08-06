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
  if (score <= 2) return { score, label: 'متوسِّطة', color: 'bg-warning' };
  if (score <= 3) return { score, label: 'جيِّدة', color: 'bg-accent-indigo' };
  return { score, label: 'قويَّة', color: 'bg-success' };
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { score, label, color } = useMemo(() => getStrength(password), [password]);

  const tierStyle = useMemo(() => {
    if (score <= 1) {
      return {
        activeBg: 'bg-rose-500 dark:bg-rose-500',
        badgeBg:
          'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 dark:border-rose-500/30',
        glow: 'shadow-[0_0_12px_rgba(244,63,94,0.35)]',
        dot: 'bg-rose-500',
      };
    }
    if (score <= 2) {
      return {
        activeBg: 'bg-amber-500 dark:bg-amber-500',
        badgeBg:
          'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30',
        glow: 'shadow-[0_0_12px_rgba(245,158,11,0.35)]',
        dot: 'bg-amber-500',
      };
    }
    if (score <= 3) {
      return {
        activeBg: 'bg-indigo-500 dark:bg-indigo-500',
        badgeBg:
          'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20 dark:border-indigo-500/30',
        glow: 'shadow-[0_0_12px_rgba(99,102,241,0.35)]',
        dot: 'bg-indigo-500',
      };
    }
    return {
      activeBg: 'bg-emerald-500 dark:bg-emerald-500',
      badgeBg:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30',
      glow: 'shadow-[0_0_12px_rgba(16,185,129,0.35)]',
      dot: 'bg-emerald-500',
    };
  }, [score]);

  if (!password) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="w-full space-y-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-3.5 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-900/50 sm:p-4 transition-all duration-300 shadow-xs"
      dir="rtl"
    >
      {/* Header Info & Dynamic Pill Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-tight text-neutral-600 dark:text-neutral-400 select-none">
          قوَّة كلمة المرور:
        </span>

        <div
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all duration-300 ${tierStyle.badgeBg}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tierStyle.dot} animate-pulse`} />
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.span>
        </div>
      </div>

      {/* Progress Track & Segment Indicator Bars */}
      <div
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuetext={`قوَّة كلمة المرور: ${label}`}
        className="flex gap-1.5 sm:gap-2 w-full items-center"
      >
        {Array.from({ length: 5 }, (_, i) => {
          const isActive = i < score;
          return (
            <div
              key={i}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800/80"
            >
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: isActive ? 1 : 0 }}
                transition={{
                  duration: 0.35,
                  delay: i * 0.04,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`h-full w-full rounded-full ${color} ${tierStyle.activeBg} ${
                  isActive ? tierStyle.glow : ''
                } transition-colors duration-300`}
                style={{ transformOrigin: 'right' }}
              />
            </div>
          );
        })}
      </div>

      {/* Screen Reader Accessibility Fallback */}
      <span className="sr-only">
        قوَّة كلمة المرور: {label} ({score} من 5)
      </span>
    </motion.div>
  );
}
