'use client';

import { Button } from '@/frontend/ui/primitives/button';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { Badge } from '@/frontend/ui/primitives/badge';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { m } from 'motion/react';
import { resultVariants } from './verify-variants';

export function VerifyErrorState({
  rateLimited,
  error,
  onRetry,
}: {
  rateLimited?: boolean;
  error?: string;
  onRetry: () => void;
}) {
  return (
    <m.div
      key="error"
      variants={resultVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20, transition: { duration: 0.15 } }}
      className="my-6"
    >
      <Card className="overflow-hidden rounded-3xl border-destructive/30 bg-card/90 shadow-2xl backdrop-blur-xl">
        <div className="bg-destructive/10 border-b border-destructive/15 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive shadow-xs">
              <AlertCircle className="size-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-destructive">
                {rateLimited ? 'تجاوز عدد المحاولات المسموحة' : 'خطأ في التَّحقُّق'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rateLimited
                  ? 'الرَّجاء الانتظار بضع دقائق قبل المحاولة مرَّة أخرى'
                  : 'تعذَّر العثور على شهادة بهذا الرَّمز في سجلاتنا'}
              </p>
            </div>
          </div>
          <Badge variant="destructive" className="px-3 py-1 text-xs rounded-full">
            {rateLimited ? 'محدود المؤقت' : 'غير مُسجَّلَة'}
          </Badge>
        </div>
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start gap-3 rounded-2xl bg-destructive/5 border border-destructive/15 p-4">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed text-foreground">{error}</p>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-2 rounded-xl border-border hover:bg-muted cursor-pointer transition-all"
            >
              <RotateCcw className="size-4" />
              <span>المحاولة مرَّة أخرى</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
