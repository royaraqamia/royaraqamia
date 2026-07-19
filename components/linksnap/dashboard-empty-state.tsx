import { motion } from 'motion/react';
import { Link2, Plus } from 'lucide-react';
import Link from 'next/link';

export function DashboardEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.33, 1, 0.68, 1] }}
      className="text-center py-16 bg-white dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-8"
    >
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
        <Link2 aria-hidden="true" className="w-8 h-8 text-indigo-400 dark:text-indigo-500" />
      </div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
        لم تقم بإنشاء أي روابط مختصرة بعد.
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-500 mb-6">
        قم باختصار رابط أعلاه لبدء تتبع النقرات!
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-indigo-100 hover:shadow-indigo-200"
      >
        <Plus aria-hidden="true" className="w-4 h-4" />
        <span>إنشاء أول رابط</span>
      </Link>
    </motion.div>
  );
}
