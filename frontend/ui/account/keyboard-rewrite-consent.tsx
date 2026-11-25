'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  enableKeyboardRewrite,
  keyboardBridgeAvailable,
  keyboardRewriteEnabled,
  revokeKeyboardRewriteCredential,
} from '@/frontend/shared/keyboard';

import { KEYBOARD_REWRITE_COPY } from './keyboard-rewrite-copy';
import { subRowClasses } from './row-classes';

/**
 * The explicit opt-in for the keyboard's one network action (ADR-0220).
 *
 * Off by default. Enabling sends a request from this signed-in page that mints a
 * rewrite-only credential and stores it in the shell's Keystore-backed store;
 * revoking deletes that copy. No keystroke is ever uploaded, and the hint says
 * exactly what a tap of the keyboard's button sends.
 */
export function KeyboardRewriteConsent() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setEnabled(keyboardRewriteEnabled());
  }, []);

  useEffect(() => {
    if (!keyboardBridgeAvailable()) return;
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  if (!keyboardBridgeAvailable()) return null;

  const label = enabled ? KEYBOARD_REWRITE_COPY.enabledLabel : KEYBOARD_REWRITE_COPY.enableLabel;

  return (
    <div className={cn(subRowClasses, 'items-start py-3')}>
      <span className="flex min-w-0 items-start gap-2.5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate font-bold">{label}</span>
          <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
            {KEYBOARD_REWRITE_COPY.enableHint}
          </span>
        </span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          if (enabled) {
            revokeKeyboardRewriteCredential();
            setEnabled(false);
          } else if (await enableKeyboardRewrite()) {
            setEnabled(true);
          }
          setBusy(false);
        }}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
      >
        {enabled ? KEYBOARD_REWRITE_COPY.revokeLabel : KEYBOARD_REWRITE_COPY.enableLabel}
      </button>
    </div>
  );
}
