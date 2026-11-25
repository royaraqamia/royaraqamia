'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  deleteCodingWorkspace,
  getCodingWorkspaces,
  startCodingConnect,
} from '@/frontend/api/coding';
import type { CodingWorkspaceDto } from '@/shared/contracts/coding-agent';
import { formatCodingDate } from './coding-labels';
import type { CodingPlan } from './coding-cap-banner';
import { NewCodingTaskForm } from './new-coding-task-form';

/** Connected repositories and the door to the member's own GitHub App flow. */
export function CodingWorkspaces({ plan }: { plan?: CodingPlan }) {
  const [workspaces, setWorkspaces] = useState<CodingWorkspaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspaces(await getCodingWorkspaces());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تحميل المستودعات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setConnecting(true);
    setActionError(null);
    try {
      const started = await startCodingConnect();
      // A consent screen belongs to GitHub's origin; the whole document leaves.
      window.location.assign(started.url);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر بدء الربط.');
      setConnecting(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const result = await deleteCodingWorkspace(id);
      if (!result.success) throw new Error(result.error ?? 'تعذّر حذف المستودع.');
      setDeletingId(null);
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر حذف المستودع.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">المستودعات المرتبطة</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            يعمل المساعد على مستودعك في بيئة منفصلة، ويعيد إليك تغييراته في فرع وطلب دمج.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {connecting ? 'جاري الربط...' : 'ربط مستودع GitHub'}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل المستودعات...</p>
      ) : workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مستودعات مرتبطة بعد.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-bold text-foreground">
                  {workspace.repoOwner}/{workspace.repoName}
                </p>
                <p className="text-xs text-muted-foreground">
                  الفرع الافتراضي: {workspace.defaultBranch} · أُضيف في{' '}
                  {formatCodingDate(workspace.createdAt)}
                </p>
                {workspace.bootstrapPrUrl && (
                  <p className="mt-1 text-xs text-amber-600">
                    راجع وادمج{' '}
                    <a
                      href={workspace.bootstrapPrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      طلب دمج تثبيت المهمات
                    </a>{' '}
                    قبل تشغيل أول مهمة.
                  </p>
                )}
              </div>
              {deletingId === workspace.id ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void remove(workspace.id)}
                    disabled={busyId === workspace.id}
                    className="rounded-lg bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-60"
                  >
                    تأكيد الحذف
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeletingId(workspace.id)}
                  className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground"
                >
                  حذف
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <NewCodingTaskForm workspaces={workspaces} plan={plan} />
    </section>
  );
}
