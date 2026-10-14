'use client';

import { useState } from 'react';
import { usePWAContext } from '@/frontend/ui/PWAProvider';
import { isShellUpdatePending } from '@/frontend/shared/shell-update';

/**
 * Announces a new build and offers the one gesture that moves this document
 * onto it (ADR-0042).
 *
 * It is deliberately the quietest thing that works: a small line above the
 * offline indicator, no modal, no countdown, no forced reload. Declining is a
 * real answer — the next launch applies the build anyway, which is what happened
 * silently before this existed (ADR-0039) — so `dismissed` is per document and
 * never nagged about.
 *
 * Two rules keep it from being noise:
 *
 * - It renders only while a worker is actually *waiting*: the build is fully
 *   downloaded and verified, so "update" means one reload, not a download on a
 *   slow connection.
 * - The Android shell gets at most one prompt. While the shell has its own APK
 *   update pending, that one is the one that matters — installing it brings the
 *   web build along — so this stays down (`isShellUpdatePending`).
 */
export function UpdatePrompt() {
  const { updateAvailable, applyUpdate } = usePWAContext();
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!updateAvailable || dismissed || isShellUpdatePending()) return null;

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
