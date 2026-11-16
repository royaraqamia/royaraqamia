'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

import { getAgentSkillOutcomes } from '@/frontend/api/agent-skill-telemetry';
import { cn } from '@/frontend/shared/cn';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import type { AgentSkillOutcomeRow } from '@/shared/contracts/agent-skill-telemetry';

/** The tally columns, in the order an operator reads them (#1449). */
const COLUMNS = [
  { key: 'loadedTurns', label: 'حُمّل', hint: 'أجوبة قرأت نص المتخصص' },
  { key: 'declinedTurns', label: 'عُرض ولم يُحمّل', hint: 'قوائم قصيرة لم يختر منها شيئاً' },
  { key: 'answeredTurns', label: 'أجاب', hint: 'من المحمّلة، ما انتهى بجواب' },
  { key: 'retriedTurns', label: 'أعاد المحاولة', hint: 'من المحمّلة، ما احتاج نداءً ثانياً' },
  { key: 'failedTurns', label: 'لم يُجب', hint: 'من المحمّلة، ما انتهى بلا جواب' },
] as const;

/**
 * What each specialist's turns add up to (#1449).
 *
 * Three numbers an operator acts on: how often the shortlist offered it, how
 * often the model actually read it, and how those turns ended. The first two
 * differ - a shortlist costs a line on every turn that clears the floor, and a
 * body is only paid for when `load_specialist` is called - so the gap is the
 * measure of a name that spends tokens without being chosen.
 *
 * Counts only, and no text: the contract carries no question, answer, member or
 * thread, and this surface never draws one. The signal is the operator's, not a
 * member-facing score or a public ranking.
 */
export function AgentSkillTelemetryView() {
  const [rows, setRows] = useState<AgentSkillOutcomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await getAgentSkillOutcomes());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-10 pt-2 sm:px-6 sm:pb-12">
      <AdminPageHeader title="المتخصصون">
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          أعداد تجميعية عن كل متخصص عرضته قائمة الاقتراحات في محادثة، وكيف انتهت الأجوبة التي قرأت
          نصه. لا سؤال ولا جواب ولا اسم عضو هنا، ولا يُعرض هذا لأي عضو.
        </p>
      </AdminPageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          المتخصصون مرتبون بحسب عدد الأجوبة التي حملته، من الأكثر إلى الأقل.
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="ms-auto gap-2 rounded-full"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل أعداد المتخصصين">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
              <Skeleton className="mb-3 h-4 w-52" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
          <p className="text-sm font-bold text-foreground">تعذر تحميل أعداد المتخصصين.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="mt-3"
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="لا أعداد بعد"
          description="لم تُسجَّل بعدُ محادثة عرضت متخصصاً واحداً."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/85">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">أعداد المتخصصين وكيف انتهت الأجوبة التي حملتهم</caption>
            <thead>
              <tr className="border-b border-border/60">
                <th scope="col" className="p-3 text-start text-xs font-bold text-muted-foreground">
                  المتخصص
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.hint}
                    className="p-3 text-center text-xs font-bold text-muted-foreground"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.skillId}
                  className="border-b border-border/40 last:border-b-0 hover:bg-accent/40"
                >
                  <th scope="row" className="p-3 text-start" dir="ltr">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {row.skillId}
                    </span>
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="p-3 text-center">
                      <span
                        dir="ltr"
                        className={cn(
                          'font-digits tabular-nums',
                          row[column.key] === 0
                            ? 'text-muted-foreground/50'
                            : 'font-bold text-foreground'
                        )}
                      >
                        {row[column.key]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
