import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in">
        <Skeleton className="h-9 w-40 skeleton-shimmer" />
        <Skeleton className="h-9 w-32 skeleton-shimmer" />
      </div>

      <Card className="animate-slide-up stagger-2">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            إجمالي الإنفاق
          </CardTitle>
          <DollarSign className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-32 mb-2 skeleton-shimmer" />
          <Skeleton className="h-4 w-48 skeleton-shimmer" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 animate-slide-up stagger-3">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 skeleton-shimmer" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] sm:h-[300px] w-full rounded-xl skeleton-shimmer" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 skeleton-shimmer" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] sm:h-[300px] w-full rounded-xl skeleton-shimmer" />
          </CardContent>
        </Card>
      </div>

      <Card className="animate-slide-up stagger-4">
        <CardHeader>
          <CardTitle>المعاملات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[52px] w-full rounded-xl skeleton-shimmer" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
