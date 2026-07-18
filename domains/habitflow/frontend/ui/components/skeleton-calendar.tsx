import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export function SkeletonCalendar() {
  return (
    <Card className="p-5 animate-pulse">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 30 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </Card>
  );
}
