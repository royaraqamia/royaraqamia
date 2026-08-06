import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { DollarSign } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading dashboard analytics"
      className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 antialiased"
    >
      {/* Navigation & Action Header Loading Skeleton */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40 animate-fade-in">
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-44 sm:w-56 rounded-xl" />
          <Skeleton className="h-4 w-28 sm:w-36 rounded-lg opacity-70" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      </header>

      {/* Main Metric Highlight Card */}
      <Card className="relative overflow-hidden border border-border/60 bg-card/60 backdrop-blur-xl shadow-xs hover:border-border hover:shadow-md transition-all duration-300 ease-out rounded-2xl group animate-slide-up stagger-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3 pt-6 px-6">
          <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground">
            إجمالي الإنفاق
          </CardTitle>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs group-hover:scale-105 transition-transform duration-300">
            <DollarSign className="size-4 text-primary" aria-hidden="true" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6 px-6">
          <Skeleton className="h-9 sm:h-10 w-36 sm:w-48 rounded-xl" />
          <Skeleton className="h-4 w-48 sm:w-64 rounded-lg opacity-75" />
        </CardContent>
      </Card>

      {/* Analytics & Visual Charts Grid */}
      <section className="grid gap-6 grid-cols-1 lg:grid-cols-2 animate-slide-up stagger-3">
        <Card className="border border-border/60 bg-card/60 backdrop-blur-xl shadow-xs hover:border-border hover:shadow-md transition-all duration-300 ease-out rounded-2xl">
          <CardHeader className="pb-3 pt-6 px-6 flex flex-row items-center justify-between">
            <Skeleton className="h-5 w-36 rounded-lg" />
            <Skeleton className="h-4 w-16 rounded-md opacity-60" />
          </CardHeader>
          <CardContent className="pb-6 px-6">
            <div className="relative w-full h-52 sm:h-72 rounded-xl border border-border/30 bg-muted/20 overflow-hidden p-4 flex items-end justify-between gap-2">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 backdrop-blur-xl shadow-xs hover:border-border hover:shadow-md transition-all duration-300 ease-out rounded-2xl">
          <CardHeader className="pb-3 pt-6 px-6 flex flex-row items-center justify-between">
            <Skeleton className="h-5 w-36 rounded-lg" />
            <Skeleton className="h-4 w-16 rounded-md opacity-60" />
          </CardHeader>
          <CardContent className="pb-6 px-6">
            <div className="relative w-full h-52 sm:h-72 rounded-xl border border-border/30 bg-muted/20 overflow-hidden p-4 flex items-end justify-between gap-2">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Detailed Transactions List Section */}
      <Card className="border border-border/60 bg-card/60 backdrop-blur-xl shadow-xs hover:border-border hover:shadow-md transition-all duration-300 ease-out rounded-2xl animate-slide-up stagger-4">
        <CardHeader className="pb-4 pt-6 px-6 border-b border-border/30 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground tracking-tight">
            المعاملات
          </CardTitle>
          <Skeleton className="h-4 w-20 rounded-md opacity-60" />
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors duration-200 gap-4"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="space-y-1.5 min-w-0">
                  <Skeleton className="h-4 w-28 sm:w-40 rounded-md" />
                  <Skeleton className="h-3 w-20 sm:w-28 rounded-md opacity-70" />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Skeleton className="h-4 w-16 sm:w-20 rounded-md" />
                <Skeleton className="h-3 w-12 rounded-md opacity-60" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
