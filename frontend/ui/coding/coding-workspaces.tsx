'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  createCodingWorkspace,
  deleteCodingWorkspace,
  getCodingAvailableRepos,
  getCodingWorkspaces,
  startCodingConnect,
} from '@/frontend/api/coding';
import type { CodingAvailableRepoDto, CodingWorkspaceDto } from '@/shared/contracts/coding-agent';
import { formatCodingDate } from './coding-labels';
import type { CodingPlan } from './coding-cap-banner';
import { NewCodingTaskForm } from './new-coding-task-form';

/** Connected repositories and the door to the member's own GitHub App flow. */
export function CodingWorkspaces({ plan }: { plan?: CodingPlan }) {
  const [workspaces, setWorkspaces] = useState<CodingWorkspaceDto[]>([]);
  const [repos, setRepos] = useState<CodingAvailableRepoDto[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [adding, setAdding] = useState(false);
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

  const loadRepos = useCallback(async () => {
    try {
      const available = await getCodingAvailableRepos();
      setRepos(available);
      setSelectedRepo((current) =>
        available.some((repo) => repo.fullName === current)
          ? current
          : (available[0]?.fullName ?? '')
      );
    } catch {
      // A missing or expired App installation is not a page failure: the connect
      // button below is the repair, and the repo picker simply stays empty.
      setRepos([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadRepos();
  }, [load, loadRepos]);

  const connected = new Set(
    workspaces.map((workspace) => `${workspace.repoOwner}/${workspace.repoName}`.toLowerCase())
  );
  const addable = repos.filter((repo) => !connected.has(repo.fullName.toLowerCase()));
  const selected = addable.some((repo) => repo.fullName === selectedRepo)
    ? selectedRepo
    : (addable[0]?.fullName ?? '');

  const add = async () => {
    const repo = repos.find((candidate) => candidate.fullName === selected);
    if (!repo) return;
    if (
      workspaces.some(
        (workspace) =>
          `${workspace.repoOwner}/${workspace.repoName}`.toLowerCase() ===
          repo.fullName.toLowerCase()
      )
    ) {
      setActionError('هذا المستودع مرتبط بالفعل.');
      return;
    }
    setAdding(true);
    setActionError(null);
    try {
      await createCodingWorkspace({ owner: repo.owner, name: repo.name });
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر ربط المستودع.');
    } finally {
      setAdding(false);
    }
  };

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

      {addable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 p-3">
          <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs">
            <span className="font-bold text-foreground">مستودعات GitHub المتاحة</span>
            <select
              value={selected}
              onChange={(event) => setSelectedRepo(event.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {addable.map((repo) => (
                <option key={repo.fullName} value={repo.fullName}>
                  {repo.fullName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !selected}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {adding ? 'جاري الإضافة...' : 'إضافة مستودع'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل المستودعات...</p>
      ) : workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد مستودعات مرتبطة بعد. اربط GitHub أو اختر مستودعًا من القائمة أعلاه.
        </p>
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
