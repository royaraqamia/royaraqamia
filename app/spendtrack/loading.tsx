import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/ui/card';
import { Skeleton } from '@/frontend/ui/ui/skeleton';
import { DollarSign } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      <Card className="animate-slide-up stagger-2">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            إجمالي الإنفاق
          </CardTitle>
          <DollarSign className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="skeleton h-9 w-32 rounded-lg" />
          <div className="skeleton h-4 w-48 rounded-md" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 animate-slide-up stagger-3">
        <Card>
          <CardHeader>
            <div className="skeleton h-5 w-32 rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="skeleton h-50 sm:h-75 w-full rounded-xl" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="skeleton h-5 w-32 rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="skeleton h-50 sm:h-75 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>

      <Card className="animate-slide-up stagger-4">
        <CardHeader>
          <CardTitle className="text-base font-medium">المعاملات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-13 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
