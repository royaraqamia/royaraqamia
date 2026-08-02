'use client';

import { Lock, ShieldCheck, Database } from 'lucide-react';
import { m } from 'motion/react';
import { itemVariants } from './verify-variants';

export function VerifyTrustFooter() {
  return (
    <m.footer variants={itemVariants} className="mt-16 border-t border-border/40 pt-8">
      <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground font-medium">
        <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40 transition-colors hover:border-primary/30">
          <Lock className="size-4 text-emerald-500" />
          <span>اتِّصال مُشفَّر SSL 256-bit</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40 transition-colors hover:border-primary/30">
          <ShieldCheck className="size-4 text-primary" />
          <span>نظام توثيق رقمي</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40 transition-colors hover:border-primary/30">
          <Database className="size-4 text-indigo-500" />
          <span>فحص آني في قاعدة البيانات</span>
        </div>
      </div>
    </m.footer>
  );
}
