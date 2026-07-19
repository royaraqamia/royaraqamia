import { Zap } from 'lucide-react';

interface MarketingHeaderProps {
  isAuthenticated: boolean;
}

export function MarketingHeader({ isAuthenticated }: MarketingHeaderProps) {
  return (
    <div className="text-center space-y-4">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-700 rounded-full text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">
        <Zap aria-hidden="true" className="w-3.5 h-3.5" />
        إعادة توجيه وتحليلات فوريَّة
      </div>
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
        بسِّط روابطك، <br />
        <span className="bg-linear-to-l from-indigo-600 to-sky-500 bg-clip-text text-transparent">
          تتبَّع الأداء في الوقت الفعلي
        </span>
      </h1>
      <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
        حوِّل الرَّوابط الطَّويلة المعقَّدة إلى أصول قصيرة قابلة للمشاركة.
        {!isAuthenticated && ' سجِّل مجَّانًا لفتح مقاييس النَّقرات الكاملة وتحليلات الزِّيارات.'}
      </p>
    </div>
  );
}
