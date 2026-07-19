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
          className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg flex items-start gap-3 relative"
        >
          <XCircle aria-hidden="true" className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              فشل إعادة التوجيه
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
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
            className="absolute top-3 left-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer press-scale"
          >
            <XCircle aria-hidden="true" className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
