'use client';

import { m } from 'motion/react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { itemVariants } from './verify-variants';

export function VerifyHero() {
  return (
    <header className="text-center">
      <m.div variants={itemVariants} className="mb-6 flex justify-center">
        <m.div
          className="relative flex size-20 items-center justify-center rounded-3xl bg-linear-to-br from-primary via-indigo-600 to-purple-700 shadow-xl shadow-primary/25 ring-8 ring-primary/10"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18, duration: 0.8 }}
        >
          <ShieldCheck className="size-10 text-white" />
          <Sparkles className="absolute -top-1 -right-1 size-5 text-amber-300 animate-pulse" />
        </m.div>
      </m.div>

      <m.h1
        variants={itemVariants}
        className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl"
      >
        التَّحقُّق من{' '}
        <span className="bg-linear-to-r from-primary via-purple-600 to-indigo-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-300 dark:to-violet-400">
          الشَّهادة
        </span>
      </m.h1>

      <m.p
        variants={itemVariants}
        className="mt-4 mx-auto max-w-lg text-sm sm:text-base text-muted-foreground leading-relaxed"
      >
        أدخِل رمز الشَّهادة المطبوع على الوثيقة للتَّحقُّق من صحَّتها وأصالتها فورًا في رؤية رقمية.
      </m.p>
    </header>
  );
}
