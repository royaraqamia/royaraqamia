import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Card } from '@/frontend/ui/primitives/card';

export function SkeletonCalendar() {
  return (
    <Card className="skeleton p-5">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 30 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </Card>
  );
}
