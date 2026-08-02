import { cn } from '@/frontend/shared/cn';

export function GlowOrb({
  className,
  ...props
}: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('absolute rounded-full blur-3xl pointer-events-none', className)}
      {...props}
    />
  );
}
