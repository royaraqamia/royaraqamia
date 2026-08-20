import { cn } from '@/frontend/shared/cn';

export function GlowOrb({
  className,
  ...props
}: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'absolute rounded-full blur-3xl pointer-events-none transform-gpu will-change-transform max-md:blur-2xl',
        className
      )}
      {...props}
    />
  );
}
