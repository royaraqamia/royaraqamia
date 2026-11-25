'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  keyboardBridgeAvailable,
  keyboardEnabled,
  keyboardIsDefault,
  openKeyboardPicker,
  openKeyboardSettings,
} from '@/frontend/shared/keyboard';

import { KeyboardRewriteConsent } from './keyboard-rewrite-consent';
import { rowClasses } from './row-classes';

/** Android owns the switch; the page only opens its controls and reads the result. */
const SWITCH_HINT = 'يقوم أندرويد بالتبديل داخل إعداداته الخاصة.';

const ACTIVATE_LABEL = 'تفعيل لوحة مفاتيح رؤية رقمية';
const DEFAULT_LABEL = 'تعيين لوحة المفاتيح افتراضية';
const ACTIVE_LABEL = 'لوحة المفاتيح مفعّلة';
const CHANGE_LABEL = 'تغيير';

type KeyboardState = { enabled: boolean; isDefault: boolean };

/**
 * The account row for the IME inside this APK (ADR-0219).
 *
 * There is no toggle that flips a switch here: a normal app cannot set the
 * default IME, and a control that claimed to would lie. The three honest states
 * are read from Android — not enabled, enabled but not chosen, chosen — and each
 * action opens the system settings or picker where the member makes the choice.
 * The row exists only inside a shell that injected the bridge and can run the
 * IME; in a browser there is nothing to say. Resolved after mount because the
 * bridge is injected by the WebView after the document hydrates.
 */
export function KeyboardSection() {
  const [state, setState] = useState<KeyboardState | null>(null);

  const refresh = useCallback(() => {
    setState({ enabled: keyboardEnabled(), isDefault: keyboardIsDefault() });
  }, []);

  useEffect(() => {
    if (!keyboardBridgeAvailable()) return;
    refresh();
    // Settings and the picker are separate Android activities: the answer they
    // leave behind is only readable when the document comes back into focus.
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  if (state === null) return null;

  const body = (label: string) => (
    <span className="flex min-w-0 items-start gap-2.5">
      <Keyboard className="mt-0.5 w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
          {SWITCH_HINT}
        </span>
      </span>
    </span>
  );

  const arrow = (
    <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
      ←
    </span>
  );

  let main: ReactNode;
  if (!state.enabled) {
    main = (
      <button type="button" onClick={openKeyboardSettings} className={rowClasses}>
        {body(ACTIVATE_LABEL)}
        {arrow}
      </button>
    );
  } else if (!state.isDefault) {
    main = (
      <button type="button" onClick={openKeyboardPicker} className={rowClasses}>
        {body(DEFAULT_LABEL)}
        {arrow}
      </button>
    );
  } else {
    main = (
      <div className={cn(rowClasses, 'cursor-default')}>
        {body(ACTIVE_LABEL)}
        <button
          type="button"
          onClick={openKeyboardPicker}
          className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {/* A drawn switch, not the site's Switch: tapping it would claim to
              toggle the IME, while the only action is Android's own picker. */}
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-11 items-center rounded-full border border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-1"
          >
            <span className="inline-block size-4 rounded-full bg-background shadow-sm" />
          </span>
          {CHANGE_LABEL}
        </button>
      </div>
    );
  }

  return (
    <>
      {main}
      <KeyboardRewriteConsent />
    </>
  );
}
