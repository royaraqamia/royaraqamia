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
      className="update-prompt fixed inset-x-0 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-card-foreground shadow-sm"
    >
      <span>يتوفَّر إصدار جديد</span>
      {/* The one gesture that costs the user a reload, so it wears the site's
          primary action — the Hero CTA's gradient, border and glow, at the
          prompt's small size. While it is applying the button goes inert
          (`disabled:pointer-events-none`), which freezes the gradient, the lift
          and the sheen rather than leaving a dead control that still lights up
          under the cursor. */}
      <button
        type="button"
        disabled={applying}
        onClick={() => {
          setApplying(true);
          applyUpdate();
        }}
        className="group relative flex items-center justify-center overflow-hidden rounded-full border border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-3 py-1 font-semibold text-white shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] transition-safe duration-300 hover:scale-[1.02] hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 hover:shadow-[0_15px_35px_-5px_rgba(147,51,234,0.7)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent -translate-x-full transition-transform duration-1000 ease-in-out group-hover:translate-x-full"
        />
        <span className="relative z-10">{applying ? 'جاري التَّحديث...' : 'تحديث الآن'}</span>
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
