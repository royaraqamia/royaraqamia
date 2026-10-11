'use client';

import { Button, type ButtonProps } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';

export function HeroCtaSheen() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out group-hover/hc:translate-x-full"
    />
  );
}

export function HeroCtaButton({ className, children, asChild, ...props }: ButtonProps) {
  return (
    <Button
      asChild={asChild}
      variant="hero"
      className={cn(
        'group/hc relative h-13 sm:h-14 gap-2.5 overflow-hidden rounded-full px-6 sm:px-8 text-base sm:text-lg font-bold text-white duration-300 hover:translate-y-0 hover:scale-[1.02] active:scale-[0.98]',
        className
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          <HeroCtaSheen />
          <span className="relative z-10 inline-flex items-center justify-center gap-2.5">
            {children}
          </span>
        </>
      )}
    </Button>
  );
}
