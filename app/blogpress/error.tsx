'use client';

import { useEffect } from 'react';
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
    console.error('BlogPress error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground font-heading">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            عذراً، حدث خطأ أثناء تحميل المقالات. يمكنك المحاولة مرة أخرى أو العودة إلى لوحة التحكم.
          </p>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">الرمز: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer hover:opacity-90 min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>إعادة المحاولة</span>
          </button>
          <Link
            href="/blogpress"
            className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground text-sm font-semibold rounded-xl transition-all flex items-center gap-2 min-h-[44px]"
          >
            <ArrowRight className="w-4 h-4" />
            <span>لوحة التحكم</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
