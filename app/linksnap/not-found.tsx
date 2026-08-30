import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <SearchX className="w-8 h-8 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-black text-foreground">الصفحة غير موجودة</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            عذراً، لم نتمكن من العثور على الصفحة التي تبحث عنها. قد يكون الرابط غير صحيح أو تمت
            إزالة الصفحة.
          </p>
        </div>
        <Link
          href="/linksnap"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-full transition-all shadow-md cursor-pointer focus-ring touch-target press-scale btn-press"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>العودة إلى الصفحة الرئيسية</span>
        </Link>
      </div>
    </div>
  );
}
