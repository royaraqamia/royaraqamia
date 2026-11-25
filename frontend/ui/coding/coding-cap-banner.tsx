import { CODING_PLAN_CAPS } from '@/shared/contracts/coding-agent';
import { cn } from '@/frontend/shared/cn';
import { formatCodingCount } from './coding-labels';

/**
 * The limits a run will obey, shown before the member starts it (ADR-0219,
 * decision 7). An unknown plan is shown the free limits and told so — guessing
 * a paid plan would promise minutes the member may not have.
 */
export type CodingPlan = 'free' | 'pro' | null | undefined;

export function CodingCapBanner({ plan, className }: { plan?: CodingPlan; className?: string }) {
  const known = plan === 'free' || plan === 'pro';
  const caps = CODING_PLAN_CAPS[known ? plan : 'free'];

  return (
    <section
      aria-label="حدود الاستخدام"
      className={cn(
        'rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground',
        className
      )}
    >
      {known ? (
        <p>حدود خطتك قبل بدء المهمة:</p>
      ) : (
        <p>نعرض حدود الخطة المجانية لأن خطتك غير معروفة بعد:</p>
      )}
      <p>
        {formatCodingCount(caps.tasksPerMonth)} مهمة في الشهر، وحتى{' '}
        {formatCodingCount(caps.runnerMinutes)} دقيقة لكل مهمة، وحتى{' '}
        {formatCodingCount(caps.maxInputTokens)} من رموز الإدخال و
        {formatCodingCount(caps.maxOutputTokens)} من رموز الإخراج.
      </p>
    </section>
  );
}
