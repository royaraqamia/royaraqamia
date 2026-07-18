import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto">
          <SearchX className="w-8 h-8 text-indigo-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-black text-slate-800 dark:text-slate-100">
            الصفحة غير موجودة
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            عذراً، لم نتمكن من العثور على الصفحة التي تبحث عنها. قد يكون الرابط غير صحيح أو تمت
            إزالة الصفحة.
          </p>
        </div>
        <Link
          href="/linksnap"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>العودة إلى الصفحة الرئيسية</span>
        </Link>
      </div>
    </div>
  );
}
