'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePWAContext } from '@/frontend/ui/PWAProvider';
import {
  SHELL_UPDATE_IDLE,
  getShellUpdateState,
  subscribeShellUpdate,
} from '@/frontend/shared/shell-update';

/**
 * Announces a waiting web build and offers the one gesture that moves the
 * document onto it (ADR-0042).
 *
 * It is deliberately the quietest thing that works: a small line above the
 * offline indicator, no modal, no countdown, no forced reload. Declining is a
 * real answer — the next launch applies the build anyway, which is what happened
 * silently before this existed (ADR-0039) — so a dismissal is remembered and
 * never nagged about. It renders only while a worker is actually *waiting*, so
 * "update" means one reload rather than a download on a slow connection.
 *
 * One offer at a time, and the shell's comes first. Inside the Android shell a
 * newer APK is announced natively (`ShellUpdatePrompt`, ADR-0043) — installing it
 * brings the newest web build with it, so a reload offer underneath would be a
 * second prompt for one update. The page learns which shell it is in from its own
 * user agent and stays down while that one is pending.
 */
export function UpdatePrompt() {
  const { updateAvailable, applyUpdate } = usePWAContext();
  const shell = useSyncExternalStore(
    subscribeShellUpdate,
    getShellUpdateState,
    () => SHELL_UPDATE_IDLE
  );
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!updateAvailable || dismissed || shell.updatePending) return null;

  return (
    <div
      role="region"
      aria-label="تحديث التطبيق"
      data-testid="update-prompt"
      className="fixed inset-x-0 bottom-32 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-card-foreground shadow-sm"
    >
      <span>يتوفَّر إصدار جديد</span>
      <button
        type="button"
        disabled={applying}
        onClick={() => {
          setApplying(true);
          applyUpdate();
        }}
        className="transition-safe rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-70"
      >
        {applying ? 'جارٍ التحديث…' : 'تحديث الآن'}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-muted-foreground underline underline-offset-2"
      >
        لاحقًا
      </button>
    </div>
  );
}
