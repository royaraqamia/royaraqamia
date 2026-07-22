// Premium Skeleton Loader Component -->
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-card border border-border/50 p-6',
        'before:absolute before:inset-0 before:bg-linear-to-r before:from-transparent before:via-white/5 before:to-transparent before:-translate-x-full before:animate-[shimmer_1.5s_ease-in-out_infinite]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
