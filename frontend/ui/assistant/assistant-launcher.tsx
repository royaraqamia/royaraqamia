'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { ASSISTANT_LAUNCHER_COPY } from './assistant-launcher-copy';
import { AssistantOrb } from './assistant-orb';

/**
 * The conversation is its own chunk: a reader who never asks نور anything should
 * not download the composer, the streaming reader or the message list on every
 * page. A chunk that cannot be fetched renders nothing, so a missing panel can
 * never take the page down with it (`docs/specs/offline-first.md`, #332).
 */
const AssistantPanel = dynamic(
  tolerateChunkFailure('assistant panel', () =>
    import('./assistant-panel').then((module) => ({ default: module.AssistantPanel }))
  ),
  { ssr: false }
);

/**
 * Where the door is not drawn.
 *
 * `/chats` already is the conversation — the floating panel over it would be a
 * second composer for the same thread — and `/auth` is a flow whose whole job is
 * to leave the page it started on, so a control that opens a member-only
 * conversation there is a door into a wall.
 */
const HIDDEN_PREFIXES = ['/auth', '/chats'] as const;

function isHidden(pathname: string): boolean {
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The assistant's door on every screen (ADR-0143).
 *
 * It sits in the inline-start corner — the physical right on this RTL site —
 * opposite the page-level FABs (`compose-fab-btn`), so a screen that already has
 * a primary action does not grow a second one on top of it. The corner rises
 * with the rest of the floats when the Recitation plays (ADR-0087), because it
 * is one of them.
 *
 * Rendered once by the root layout rather than by each page: a control that is
 * the product's most valuable way in cannot depend on every future screen
 * remembering to mount it.
 */
export function AssistantLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (isHidden(pathname ?? '')) return null;

  return (
    <>
      <button
        type="button"
        data-assistant-launcher
        data-visual="assistant-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ASSISTANT_LAUNCHER_COPY.navLabel}
        onClick={() => setOpen(true)}
        className="group fixed bottom-[calc(var(--roy-corner-rest)+var(--roy-float-rise))] z-50 inline-flex items-center justify-center gap-2.5 rounded-full border border-white/10 bg-neutral-950 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-violet-400/40 hover:shadow-[0_24px_48px_-18px_rgba(139,92,246,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95 max-sm:start-4 max-sm:p-0 sm:start-6 sm:ps-1.5 sm:pe-5 print:hidden"
      >
        <AssistantOrb className="shrink-0 max-sm:size-14 sm:size-11" />
        <span className="max-sm:hidden pe-1 text-[13px] font-bold leading-none sm:inline">
          {ASSISTANT_LAUNCHER_COPY.label}
        </span>
      </button>

      {open ? <AssistantPanel onDismiss={() => setOpen(false)} /> : null}
    </>
  );
}
