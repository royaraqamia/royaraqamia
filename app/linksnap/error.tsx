'use client';

import { useEffect } from 'react';
import { logger } from '@/shared/logger';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Unhandled error', { error: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-black text-foreground">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            عذراً، حدث خطأ أثناء معالجة طلبك. يمكنك المحاولة مرة أخرى أو العودة إلى الصفحة الرئيسية.
          </p>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">الرمز: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-full transition-all shadow-md flex items-center gap-2 cursor-pointer press-scale focus-ring touch-target btn-press"
          >
            <RefreshCw className="w-4 h-4" />
            <span>إعادة المحاولة</span>
          </button>
          <Link
            href="/linksnap"
            className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground text-sm font-semibold rounded-full transition-all flex items-center gap-2 focus-ring touch-target btn-press"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>الصفحة الرئيسية</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
