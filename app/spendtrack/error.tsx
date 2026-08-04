'use client';

import { useEffect } from 'react';
import { logger } from '@/shared/logger';
import { AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('SpendTrack error', { error: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6" role="alert">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-bold text-foreground">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-muted-foreground leading-relaxed" aria-live="polite">
            عذراً، حدث خطأ أثناء تحميل البيانات. يمكنك المحاولة مرة أخرى أو العودة إلى لوحة التحكم.
          </p>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">الرمز: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-full transition-all shadow-md flex items-center gap-2 cursor-pointer hover:opacity-90 btn-press btn-lift focus-ring touch-target"
            aria-label="إعادة المحاولة"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>إعادة المحاولة</span>
          </button>
          <Link
            href="/spendtrack"
            className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground text-sm font-semibold rounded-full transition-all flex items-center gap-2 btn-press focus-ring touch-target"
          >
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
            <span>لوحة التحكم</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
