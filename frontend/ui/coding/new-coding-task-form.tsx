'use client';

import { useState, type FormEvent } from 'react';

import { createCodingTask } from '@/frontend/api/coding';
import {
  CODING_TASK_MODES,
  type CodingTaskMode,
  type CodingWorkspaceDto,
} from '@/shared/contracts/coding-agent';
import { CODING_MODE_LABELS } from './coding-labels';
import { CodingCapBanner, type CodingPlan } from './coding-cap-banner';

/**
 * The run is never started silently: the caps are drawn above the button, and
 * the default mode is «خطة», so a first task only proposes a plan and a diff.
 */
export function NewCodingTaskForm({
  workspaces,
  plan,
}: {
  workspaces: CodingWorkspaceDto[];
  plan?: CodingPlan;
}) {
  const [workspaceId, setWorkspaceId] = useState('');
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState<CodingTaskMode>('plan');
  const [repoIds, setRepoIds] = useState<string[]>([]);
  /**
   * The branch the member typed, or `null` to follow the selected repository's
   * default. The repositories arrive from the parent's own read, after this form
   * has first rendered, so neither choice can be a `useState` initial value: the
   * selection stayed empty and `submit` returned before sending anything, and the
   * branch stayed `main` whatever the repository's default was (#1888).
   */
  const [typedBranch, setTypedBranch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspace = workspaces.find((candidate) => candidate.id === workspaceId) ?? workspaces[0];
  const activeWorkspaceId = workspace?.id ?? '';
  const group = workspace?.kind === 'group';
  const baseBranch = group
    ? (workspace?.repos[0]?.defaultBranch ?? 'main')
    : (typedBranch ?? workspace?.defaultBranch ?? 'main');
  /** A group task may narrow its workspace's set; the default is every repo. */
  const selectedRepoIds =
    group && workspace
      ? repoIds.length === 0
        ? workspace.repos.map((repo) => repo.id)
        : repoIds.filter((id) => workspace.repos.some((repo) => repo.id === id))
      : [];

  const chooseWorkspace = (id: string) => {
    setWorkspaceId(id);
    setTypedBranch(null);
    setRepoIds([]);
  };

  const toggleRepo = (id: string) => {
    setRepoIds((current) => {
      const all = workspace?.repos.map((repo) => repo.id) ?? [];
      const next = current.length === 0 ? all : current;
      if (!next.includes(id)) return [...next, id];
      // A task needs at least one repository; the last one cannot be removed.
      if (next.length <= 1) return next;
      return next.filter((value) => value !== id);
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !workspace) return;
    setBusy(true);
    setError(null);
    try {
      const task = await createCodingTask({
        workspaceId: activeWorkspaceId,
        title: title.trim(),
        instruction: instruction.trim(),
        mode,
        baseBranch: baseBranch.trim(),
        ...(group ? { repoIds: selectedRepoIds } : {}),
      });
      window.location.assign(`/coding/${encodeURIComponent(task.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء المهمة.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-foreground">مهمة جديدة</h3>
      {workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">اربط مستودعًا أولًا لتبدأ مهمة جديدة.</p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">المستودع</span>
            <select
              value={activeWorkspaceId}
              onChange={(event) => chooseWorkspace(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.kind === 'local'
                    ? `مجلد محلي — ${workspace.deviceLabel ?? 'جهاز'}`
                    : `${workspace.repoOwner ?? ''}/${workspace.repoName ?? ''}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">العنوان</span>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">ما تريد تنفيذه</span>
            <textarea
              required
              rows={4}
              maxLength={20000}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">الطريقة</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as CodingTaskMode)}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                {CODING_TASK_MODES.map((value) => (
                  <option key={value} value={value}>
                    {CODING_MODE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            {!group && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">الفرع الأساسي</span>
                <input
                  type="text"
                  required
                  value={baseBranch}
                  onChange={(event) => setTypedBranch(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
            )}
          </div>
          {group && workspace && (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="font-bold">المستودعات في هذه المهمة</legend>
              <div className="flex flex-wrap gap-3">
                {workspace.repos.map((repo) => (
                  <label key={repo.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selectedRepoIds.includes(repo.id)}
                      onChange={() => toggleRepo(repo.id)}
                    />
                    {repo.fullName}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                كل مستودع مختار يحصل على فرع وطلب دمج خاص به.
              </p>
            </fieldset>
          )}
          <CodingCapBanner plan={plan} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy ? 'جاري إنشاء المهمة...' : 'بدء المهمة'}
          </button>
        </>
      )}
    </form>
  );
}
