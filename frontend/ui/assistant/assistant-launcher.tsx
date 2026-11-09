'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';

import { assistantWasOpened } from './assistant-hint';
import { ASSISTANT_LAUNCHER_COPY } from './assistant-launcher-copy';
import { AssistantOrb } from './assistant-orb';

/**
 * The conversation is its own chunk: a reader who never asks نور anything should
 * not download the composer, the streaming reader or the message list on every
 * page. The import happens on intent — not in a `next/dynamic` declaration,
 * because the loader runtime would ride along in the shell's chunk for every
 * page — and a chunk that cannot be fetched simply opens nothing, so a missing
 * panel can never take the page down with it (`docs/specs/offline-first.md`,
 * #332).
 */
type PanelComponent = ComponentType<{ open: boolean; onDismiss: () => void }>;

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
 *
 * The panel itself stays mounted after its first open (ADR-0150): unmounting it
 * threw away the thread, the draft and the scroll position, so every reopen
 * asked the server for the same conversation it had just shown. The chunk and
 * the conversation are both warm now; only the data is revalidated.
 */
export function AssistantLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [Panel, setPanel] = useState<PanelComponent | null>(null);

  /**
   * Fetch the conversation once. Hover, focus and a pointer down all start it,
   * so the download overlaps the gesture that was going to open it anyway.
   * Answers whether the chunk is usable, so a failed fetch opens nothing.
   */
  const loadPanel = useCallback(async (): Promise<boolean> => {
    if (Panel) return true;
    try {
      const module = await import('./assistant-panel');
      setPanel(() => module.AssistantPanel);
      return true;
    } catch {
      return false;
    }
  }, [Panel]);

  // A returning reader's chunk warms while the page is idle: the cost lands
  // where nothing is being read, and the first tap opens a conversation that is
  // already parsed. A first visit pays nothing for a door it may never open —
  // the reason the chunk is not in the shell (ADR-0143).
  useEffect(() => {
    if (Panel || !assistantWasOpened()) return;

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => void loadPanel(), { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }

    const timer = window.setTimeout(() => void loadPanel(), 1500);
    return () => window.clearTimeout(timer);
  }, [Panel, loadPanel]);

  if (isHidden(pathname ?? '')) return null;

  function openPanel() {
    if (Panel) {
      setOpen(true);
      return;
    }

    // The click is a promise: leave the button in its busy state until the
    // chunk is parsed, then open. A chunk that never arrives opens nothing.
    setLoading(true);
    void loadPanel().then((loaded) => {
      setLoading(false);
      if (loaded) setOpen(true);
    });
  }

  return (
    <>
      <button
        type="button"
        data-assistant-launcher
        data-visual="assistant-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={loading}
        aria-label={ASSISTANT_LAUNCHER_COPY.navLabel}
        onClick={openPanel}
        onPointerEnter={() => void loadPanel()}
        onPointerDown={() => void loadPanel()}
        onFocus={() => void loadPanel()}
        className="group fixed bottom-[calc(var(--roy-corner-rest)+var(--roy-float-rise))] z-50 inline-flex items-center justify-center gap-2.5 rounded-full border border-white/10 bg-neutral-950 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-violet-400/40 hover:shadow-[0_24px_48px_-18px_rgba(139,92,246,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95 max-sm:start-4 max-sm:p-0 sm:start-6 sm:ps-1.5 sm:pe-5 print:hidden"
      >
        <AssistantOrb className="shrink-0 max-sm:size-14 sm:size-11" />
        <span className="max-sm:hidden pe-1 text-[13px] font-bold leading-none sm:inline">
          {ASSISTANT_LAUNCHER_COPY.label}
        </span>
      </button>

      {Panel ? <Panel open={open} onDismiss={() => setOpen(false)} /> : null}
    </>
  );
}
