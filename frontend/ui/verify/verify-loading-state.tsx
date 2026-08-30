'use client';

import { Loader2 } from 'lucide-react';
import { m } from 'motion/react';

export function VerifyLoadingState() {
  return (
    <m.div
      key="loading"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      className="my-6 rounded-3xl border border-primary/20 bg-card/60 p-8 sm:p-12 text-center backdrop-blur-xl shadow-xl shadow-primary/5"
    >
      <div className="relative mx-auto flex size-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 shadow-inner">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </div>
      <div className="mt-6 space-y-2">
        <h3 className="text-base font-bold text-foreground">
          جارٍ التَّحقُّق من أصالة الشَّهادة...
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          يتمُّ مطابقة السِّجلات الرَّقميَّة المُشفَّرة والتَّحقُّق من التَّوقيع المُعتمَد
        </p>
      </div>
      <div className="mt-6 flex justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <m.div
            key={i}
            className="size-2 rounded-full bg-primary"
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </m.div>
  );
}
