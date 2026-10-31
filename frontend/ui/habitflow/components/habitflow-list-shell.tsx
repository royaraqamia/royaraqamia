import { ListChecks } from 'lucide-react';

import { HABITFLOW_COPY } from './habitflow-copy';

/**
 * The HabitFlow list's heading and its empty state (#649), the pair of the app's
 * `HabitflowScreen`.
 *
 * Extracted from `dashboard-shell.tsx` in the change that ports the list: the
 * dashboard draws eleven glyphs for its date toolbar, its stats and its backup
 * footer, and a pair measured against the whole dashboard would drag all eleven
 * into the app's icon set to say "العادات". The list is the unit, so the list is
 * what is paired (ADR-0098, ADR-0103) — the same reason the services menu's table
 * moved out of the navbar for #647.
 */
export function HabitflowListShell({ count }: { count: number }) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-transparent">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            {HABITFLOW_COPY.listTitle}
          </h2>
          {count > 0 && (
            <span className="inline-flex items-center justify-center px-3 py-0.5 text-xs font-bold rounded-full bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 border border-zinc-300/50 dark:border-zinc-700/50">
              {count}
            </span>
          )}
        </div>
      </div>

      {count === 0 && (
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-zinc-300/70 bg-linear-to-b from-zinc-50/80 to-transparent px-6 py-14 text-center dark:border-zinc-800 dark:from-zinc-900/50">
          <div className="relative mb-5">
            <div
              className="absolute -inset-3 rounded-full bg-primary/15 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative flex size-16 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white text-primary shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <ListChecks className="size-7" aria-hidden="true" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {HABITFLOW_COPY.emptyTitle}
          </h3>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {HABITFLOW_COPY.emptyBody}
          </p>
        </div>
      )}
    </>
  );
}
