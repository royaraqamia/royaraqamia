'use client';

import { useEffect } from 'react';
import { logger } from '@/frontend/shared/logger';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, House } from 'lucide-react';
import { Button } from '@/frontend/ui/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('HabitFlow error', { error: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-dvh bg-background">
      <main id="main-content" className="flex flex-col items-center justify-center px-6 pt-24">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-2">حدث خطأ غير متوقَّع</h1>
        <p className="text-muted-foreground mb-8">
          عذرًا، حدث خطأ أثناء تحميل البيانات. يمكنك المحاولة مرَّة أخرى.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono mb-8">الرَّمز: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button onClick={reset} variant="default" className="btn-press touch-target focus-ring">
            <RefreshCw className="w-4 h-4 ms-1.5" />
            إعادة المحاولة
          </Button>
          <Link href="/habitflow">
            <Button variant="outline" className="btn-press touch-target focus-ring">
              <House className="w-4 h-4 ms-1.5" />
              العودة إلى الرَّئيسيَّة
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
