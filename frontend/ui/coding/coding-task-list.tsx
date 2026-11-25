'use client';

import { useCallback, useEffect, useState } from 'react';

import { deleteCodingTask, getCodingTasks, type CodingTaskWithUsage } from '@/frontend/api/coding';
import { formatCodingDate, isCodingTaskActive, CODING_MODE_LABELS } from './coding-labels';
import { CodingStatusLabel } from './coding-status-label';

/**
 * The task list is one cursor at a time: a page step keeps the opaque cursor the
 * server gave, so a task created while the member reads is not skipped or read
 * twice. Cancellation is a local state move after the server accepts it.
 */
export function CodingTaskList() {
  const [tasks, setTasks] = useState<CodingTaskWithUsage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await getCodingTasks();
      setTasks(page.tasks);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تحميل المهام.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setActionError(null);
    try {
      const page = await getCodingTasks(nextCursor);
      setTasks((current) => {
        const seen = new Set(current.map((task) => task.id));
        return [...current, ...page.tasks.filter((task) => !seen.has(task.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر تحميل المزيد.');
    } finally {
      setLoadingMore(false);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const result = await deleteCodingTask(id);
      if (!result.success) throw new Error(result.error ?? 'تعذّر إلغاء المهمة.');
      setTasks((current) =>
        current.map((task) => (task.id === id ? { ...task, status: 'cancelled' } : task))
      );
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر إلغاء المهمة.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-4">
      <h2 className="text-lg font-bold text-foreground">مهامي</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل المهام...</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مهام بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-2 text-start font-bold">
                  المهمة
                </th>
                <th scope="col" className="px-2 py-2 text-start font-bold">
                  الحالة
                </th>
                <th scope="col" className="px-2 py-2 text-start font-bold">
                  التاريخ
                </th>
                <th scope="col" className="px-2 py-2 text-start font-bold">
                  طلب الدمج
                </th>
                <th scope="col" className="px-2 py-2 text-start font-bold">
                  إجراء
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-border/60">
                  <td className="px-2 py-2">
                    <a
                      href={`/coding/${encodeURIComponent(task.id)}`}
                      className="font-bold underline"
                    >
                      {task.title}
                    </a>
                    <span className="ms-2 text-xs text-muted-foreground">
                      {CODING_MODE_LABELS[task.mode]}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <CodingStatusLabel status={task.status} />
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {formatCodingDate(task.createdAt)}
                  </td>
                  <td className="px-2 py-2">
                    {task.pullRequestUrl ? (
                      <a
                        href={task.pullRequestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        طلب الدمج
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {isCodingTaskActive(task.status) && (
                      <button
                        type="button"
                        onClick={() => void cancel(task.id)}
                        disabled={busyId === task.id}
                        className="rounded-lg border border-border/70 px-2 py-1 text-xs font-bold text-muted-foreground disabled:opacity-60"
                      >
                        إلغاء
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="w-fit rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-60"
        >
          {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
        </button>
      )}
    </section>
  );
}
