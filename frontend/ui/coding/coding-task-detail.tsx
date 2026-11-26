'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CodingFailureCode } from '@/shared/contracts/coding-agent';
import { decideCodingStep, getCodingTask, type CodingTaskWithUsage } from '@/frontend/api/coding';
import {
  CODING_FAILURE_LABELS,
  CODING_MODE_LABELS,
  CODING_STEP_KIND_LABELS,
  CODING_STEP_STATUS_LABELS,
  formatCodingCount,
  formatCodingDate,
  isCodingTaskActive,
} from './coding-labels';
import { CodingStatusLabel } from './coding-status-label';

const POLL_MS = 5_000;

/**
 * The detail view is the review desk (ADR-0219): a proposed step is read as a
 * diff and only a person turns it into an edit. While the runner can still move
 * the task, this view pulls its own state every 5 seconds and stops on unmount.
 */
export function CodingTaskDetail({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<CodingTaskWithUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setTask(await getCodingTask(taskId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تحميل المهمة.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = task ? isCodingTaskActive(task.status) : false;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const decide = async (stepId: string, decision: 'approve' | 'reject') => {
    setBusyStepId(stepId);
    setActionError(null);
    try {
      const result = await decideCodingStep(taskId, stepId, decision);
      if (!result.success) throw new Error(result.error ?? 'تعذّر تسجيل القرار.');
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر تسجيل القرار.');
    } finally {
      setBusyStepId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">جاري تحميل المهمة...</p>;
  if (!task) return <p className="text-sm text-destructive">{error ?? 'تعذّر تحميل المهمة.'}</p>;

  return (
    <div className="flex flex-col gap-4">
      <a href="/coding" className="w-fit text-sm text-primary underline">
        العودة إلى المهام
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">{task.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {CODING_MODE_LABELS[task.mode]} · أُنشئت في {formatCodingDate(task.createdAt)}
          </p>
        </div>
        <CodingStatusLabel status={task.status} />
      </div>

      <section className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
        <h3 className="font-bold">التعليمات</h3>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
          {task.instruction}
        </p>
      </section>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 p-3">
          <dt className="text-xs text-muted-foreground">الفرع</dt>
          <dd className="font-bold text-foreground">{task.branch ?? '—'}</dd>
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <dt className="text-xs text-muted-foreground">طلب الدمج</dt>
          <dd className="font-bold">
            {task.pullRequestUrl ? (
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                افتح طلب الدمج
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      {task.summary && <p className="text-sm leading-relaxed text-foreground">{task.summary}</p>}
      {(task.inputTokens != null || task.outputTokens != null) && (
        <p className="text-sm text-muted-foreground">
          الرموز المستخدمة في المهمة: {formatCodingCount(task.inputTokens)} /{' '}
          {formatCodingCount(task.outputTokens)}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {task.failureCode && (
        <p className="text-sm font-bold text-destructive">
          سبب التوقف:{' '}
          {CODING_FAILURE_LABELS[task.failureCode as CodingFailureCode] ?? 'تعذّر إتمام المهمة.'}
        </p>
      )}

      <section>
        <h3 className="mb-2 text-base font-bold text-foreground">خطوات التنفيذ</h3>
        {task.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد خطوات بعد.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {task.steps.map((step) => (
              <li key={step.id} className="rounded-xl border border-border/70 bg-card/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {CODING_STEP_KIND_LABELS[step.kind]}: {step.summary}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {CODING_STEP_STATUS_LABELS[step.status]}
                  </span>
                </div>
                {(step.inputTokens != null || step.outputTokens != null) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    الرموز المستخدمة: {formatCodingCount(step.inputTokens)} /{' '}
                    {formatCodingCount(step.outputTokens)}
                  </p>
                )}
                {step.diff && (step.status === 'proposed' || step.kind === 'review') && (
                  <>
                    <pre
                      className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-start text-xs"
                      dir="ltr"
                    >
                      {step.diff}
                    </pre>
                    {step.status === 'proposed' && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busyStepId === step.id}
                          onClick={() => void decide(step.id, 'approve')}
                          className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-60"
                        >
                          موافقة
                        </button>
                        <button
                          type="button"
                          disabled={busyStepId === step.id}
                          onClick={() => void decide(step.id, 'reject')}
                          className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground disabled:opacity-60"
                        >
                          رفض
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
