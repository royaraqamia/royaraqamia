import { Link2, Plus } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';

export function DashboardEmptyState() {
  return (
    <EmptyState
      icon={Link2}
      variant="card"
      title="لم تقم بإنشاء أي روابط مختصرة بعد."
      description="قم باختصار رابط أعلاه لبدء تتبع النقرات!"
      action={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-full transition-all shadow-md shadow-primary/20 hover:shadow-primary/30 cursor-pointer focus-ring touch-target press-scale btn-lift"
        >
          <Plus aria-hidden="true" className="w-4 h-4" />
          <span>إنشاء أول رابط</span>
        </Link>
      }
    />
  );
}
