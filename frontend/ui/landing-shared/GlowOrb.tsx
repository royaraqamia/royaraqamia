import { cn } from '@/frontend/shared/cn';

export function GlowOrb({
  className,
  ...props
}: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // No will-change/transform-gpu here: layer promotion costs memory per
        // orb and only pays off while animating. Orbs are static decoration.
        'absolute rounded-full blur-3xl pointer-events-none max-md:blur-2xl',
        className
      )}
      {...props}
    />
  );
}
