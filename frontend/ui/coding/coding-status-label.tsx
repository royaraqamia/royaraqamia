import type { CodingTaskStatus } from '@/shared/contracts/coding-agent';
import { cn } from '@/frontend/shared/cn';
import { CODING_TASK_STATUS_LABELS } from './coding-labels';

/** A task's state in the member's words, coloured only after it is read. */
export function CodingStatusLabel({
  status,
  className,
}: {
  status: CodingTaskStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-bold',
        status === 'completed'
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : status === 'failed'
            ? 'bg-destructive/15 text-destructive'
            : status === 'cancelled'
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary',
        className
      )}
    >
      {CODING_TASK_STATUS_LABELS[status]}
    </span>
  );
}
