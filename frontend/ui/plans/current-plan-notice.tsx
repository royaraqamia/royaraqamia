'use client';

import Link from 'next/link';

import { Badge } from '@/frontend/ui/primitives/badge';
import { useMyUsage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount, formatHijriDate } from '@/frontend/shared/format';

interface CurrentPlanNoticeProps {
  freeCredits: number;
  anonymousDailyCredits: number;
}

/**
 * What this page means for the person reading it. The page itself is a cached
 * public shell; this client component is the only per-account read, so a
 * visitor and a signed-in member get the same document with one honest line.
 */
export function CurrentPlanNotice({ freeCredits, anonymousDailyCredits }: CurrentPlanNoticeProps) {
  const { user, isLoading } = useSession();
  const { state } = useMyUsage(Boolean(user));

  if (isLoading) return null;

  if (!user) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
        أنت تتصفَّح كزائر:{' '}
        <strong className="text-foreground">{formatCount(anonymousDailyCredits)}</strong> أرصدة كل
        24 ساعة. أنشئ حساباً مجاناً لتحصل على{' '}
        <strong className="text-foreground">{formatCount(freeCredits)}</strong> رصيداً كل 30 يوماً.{' '}
        <Link
          href="/auth/signup"
          className="font-bold text-primary underline-offset-4 hover:underline"
        >
          إنشاء حساب
        </Link>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-xs text-muted-foreground sm:text-sm">
      <span className="flex items-center gap-2">
        <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
          {state.unlimited
            ? 'غير محدود'
            : state.plan === 'pro'
              ? 'الخطة المدفوعة'
              : 'الخطة المجانيَّة'}
        </Badge>
        {state.unlimited
          ? 'حساب مشرف: لا ينطبق عليه حدُّ الاستهلاك.'
          : `متبقٍّ لك ${formatCount(state.remaining)} من ${formatCount(state.cap)} رصيداً.`}
      </span>
      <Link
        href="/account/plan"
        className="font-bold text-primary underline-offset-4 hover:underline"
      >
        {state.plan === 'pro' && state.expiresAt
          ? `تنتهي في ${formatHijriDate(state.expiresAt)}`
          : 'تفاصيل استهلاكك'}
      </Link>
    </div>
  );
}
