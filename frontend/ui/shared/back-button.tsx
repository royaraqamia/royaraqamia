'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';
import { hasInAppNavigation } from '@/frontend/ui/navbar/nav-history';
import { parentRouteOf } from '@/frontend/ui/navbar/route-kind';

/**
 * Generic, route-agnostic back control — the single back affordance in the app.
 *
 * In-app history wins whenever there is any: the user gets back whatever they
 * were looking at a moment ago. A page opened cold — a refresh, a shared link,
 * an Android App Link — has nothing to pop, so the control goes *up* the URL to
 * the nearest real page instead of dropping the visitor out of the site.
 *
 * `className` is merged last, so a host surface (the sticky back header) can
 * restyle it without a second implementation of the same decision.
 */
export function BackButton({ label = 'رجوع', className }: { label?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleBack = () => {
    if (hasInAppNavigation()) {
      router.back();
      return;
    }
    router.push(parentRouteOf(pathname));
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={handleBack}
      className={cn(
        'group size-9 rounded-full border border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-primary/20 hover:text-primary transition-safe',
        className
      )}
    >
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Button>
  );
}
