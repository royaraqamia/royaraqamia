'use client';

export function ChartsSkeleton() {
  return (
    <div
      className="h-70 sm:h-80 w-full animate-pulse rounded-3xl border border-border/60 bg-linear-to-b from-muted/40 to-muted/20"
      role="img"
      aria-label="جارِ تحميل الرسم البياني"
    >
      <div className="h-full w-full rounded-3xl bg-linear-to-b from-transparent via-muted/20 to-transparent" />
    </div>
  );
}
