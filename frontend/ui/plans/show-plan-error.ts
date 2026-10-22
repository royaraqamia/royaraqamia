'use client';

import { toast } from 'sonner';
import { isPlanRefusal } from '@/frontend/shared/plans/plan-limits';

/**
 * Show a failed action's message, with the plan remedy when that is what failed.
 *
 * A plan refusal (an empty allowance, or a standing cap) has a message worth
 * reading — "you have reached the plan's limit (5)" — and one obvious next step,
 * so it gets the toast action instead of the product's generic apology. Every
 * other failure keeps the caller's own copy.
 */
export function showActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error && error.message ? error.message : fallback;

  if (isPlanRefusal(error)) {
    toast.error(message, {
      duration: 8000,
      action: {
        label: 'الخطط',
        onClick: () => {
          window.location.assign('/pricing');
        },
      },
    });
    return message;
  }

  toast.error(fallback);
  return message;
}
