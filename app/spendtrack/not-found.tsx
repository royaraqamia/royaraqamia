import { ArrowRight, SearchX } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <SearchX className="w-8 h-8 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-bold text-foreground">الصفحة غير موجودة</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            عذراً، لم نتمكن من العثور على الصفحة التي تبحث عنها.
          </p>
        </div>
        <Link
          href="/spendtrack"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-full px-5 py-2.5 transition-all shadow-md btn-press btn-lift focus-ring touch-target"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى لوحة التحكم
        </Link>
      </div>
    </div>
  );
}
