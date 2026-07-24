import { motion, useReducedMotion } from 'motion/react';
import { Link2, Plus } from 'lucide-react';
import Link from 'next/link';

export function DashboardEmptyState() {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.33, 1, 0.68, 1] }}
      className="text-center py-16 bg-card border border-dashed border-border rounded-3xl p-8 card-lift"
    >
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-float">
        <Link2 aria-hidden="true" className="w-8 h-8 text-primary" />
      </div>
      <p className="text-sm font-bold text-foreground mb-1">لم تقم بإنشاء أي روابط مختصرة بعد.</p>
      <p className="text-xs text-muted-foreground mb-6">قم باختصار رابط أعلاه لبدء تتبع النقرات!</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-xl transition-all shadow-md shadow-primary/20 hover:shadow-primary/30 cursor-pointer focus-ring touch-target press-scale btn-lift"
      >
        <Plus aria-hidden="true" className="w-4 h-4" />
        <span>إنشاء أول رابط</span>
      </Link>
    </motion.div>
  );
}
