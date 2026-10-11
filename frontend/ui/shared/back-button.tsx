'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';

/**
 * Generic, route-agnostic back control. It walks the browser (Next router)
 * history so it returns the user to wherever they came from instead of a
 * hard-coded destination — usable on any page.
 */
export function BackButton({ label = 'رجوع' }: { label?: string }) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => router.back()}
      className="group size-9 rounded-full border border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-primary/20 hover:text-primary transition-safe"
    >
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Button>
  );
}
