'use client';

import { motion, AnimatePresence } from 'motion/react';
import { XCircle } from 'lucide-react';

interface RedirectError {
  type: string;
  code?: string;
}

interface RedirectErrorBannerProps {
  error: RedirectError | null;
  onDismiss: () => void;
}

export function RedirectErrorBanner({ error, onDismiss }: RedirectErrorBannerProps) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 relative"
        >
          <XCircle aria-hidden="true" className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-foreground">فشل إعادة التوجيه</p>
            <p className="text-xs text-muted-foreground">
              {error.type === 'oauth_failed'
                ? `فشل تسجيل الدخول عبر Google. حاول مرة أخرى أو استخدم البريد الإلكتروني.${error.code ? ` (${error.code})` : ''}`
                : error.type === 'blocked'
                  ? `الرمز المختصر /${error.code} تم إلغاء تنشيطه بسبب انتهاك إرشادات المجتمع.`
                  : `الرمز المختصر /${error.code} غير موجود أو منتهي الصلاحية.`}
            </p>
          </div>
          <button
            onClick={onDismiss}
            aria-label="إغلاق"
            className="absolute top-3 left-3 p-2.5 text-muted-foreground hover:text-foreground cursor-pointer press-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <XCircle aria-hidden="true" className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
