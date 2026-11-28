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
import { CodingLocalCompanion } from './coding-local-companion';
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
  const [groupName, setGroupName] = useState('');
  const [groupRepos, setGroupRepos] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

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
    workspaces
      .filter((workspace) => workspace.repoOwner && workspace.repoName)
      .map((workspace) => `${workspace.repoOwner}/${workspace.repoName}`.toLowerCase())
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

  const createGroup = async () => {
    const chosen = repos.filter((repo) => groupRepos.includes(repo.fullName));
    if (groupName.trim().length === 0) {
      setActionError('اكتب اسمًا للمجموعة.');
      return;
    }
    if (chosen.length < 2) {
      setActionError('اختر مستودعين على الأقل.');
      return;
    }
    setCreatingGroup(true);
    setActionError(null);
    try {
      await createCodingWorkspace({
        kind: 'group',
        name: groupName.trim(),
        repos: chosen.map((repo) => ({ owner: repo.owner, name: repo.name })),
      });
      setGroupName('');
      setGroupRepos([]);
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذّر إنشاء المجموعة.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const toggleGroupRepo = (fullName: string) => {
    setGroupRepos((current) =>
      current.includes(fullName)
        ? current.filter((value) => value !== fullName)
        : [...current, fullName]
    );
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
            تعمل المهام على مستودعك في بيئة منفصلة، وتعيد إليك تغييراتها في فرع وطلب دمج.
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

      {repos.length >= 2 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <p className="text-xs font-bold text-foreground">مجموعة مستودعات</p>
          <p className="text-xs text-muted-foreground">
            مهمة واحدة تعمل على عدة مستودعات وتفتح طلب دمج لكل مستودع. يجب أن تقع كلها تحت تثبيت
            واحد للتطبيق.
          </p>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-bold text-foreground">اسم المجموعة</span>
            <input
              type="text"
              maxLength={80}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="التطبيق ولوحة التحكم"
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-bold text-foreground">المستودعات</legend>
            <div className="flex flex-wrap gap-3">
              {repos.map((repo) => (
                <label key={repo.fullName} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={groupRepos.includes(repo.fullName)}
                    onChange={() => toggleGroupRepo(repo.fullName)}
                  />
                  {repo.fullName}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => void createGroup()}
            disabled={creatingGroup}
            className="w-fit rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {creatingGroup ? 'جاري إنشاء المجموعة...' : 'إنشاء مجموعة'}
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
                  {workspace.kind === 'local'
                    ? `مجلد محلي — ${workspace.deviceLabel ?? 'جهاز'}`
                    : workspace.kind === 'group'
                      ? `${workspace.name ?? 'مجموعة'} — ${workspace.repos.length} من المستودعات`
                      : `${workspace.repoOwner ?? ''}/${workspace.repoName ?? ''}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {workspace.kind === 'group'
                    ? workspace.repos.map((repo) => repo.fullName).join(' · ')
                    : workspace.defaultBranch
                      ? `الفرع الافتراضي: ${workspace.defaultBranch} · `
                      : ''}
                  {workspace.kind !== 'group' && `أُضيف في ${formatCodingDate(workspace.createdAt)}`}
                </p>
                {workspace.bootstrapPrUrls.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    راجع وادمج{' '}
                    {workspace.bootstrapPrUrls.map((url, index) => (
                      <span key={url}>
                        {index > 0 ? ' و' : ''}
                        <a href={url} target="_blank" rel="noreferrer" className="underline">
                          طلب دمج تثبيت المهام {index + 1}
                        </a>
                      </span>
                    ))}{' '}
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

      <CodingLocalCompanion onPaired={load} />

      <NewCodingTaskForm workspaces={workspaces} plan={plan} />
    </section>
  );
}
