'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import type { ChatEmojiLabels } from './emoji-catalog';

/**
 * The catalog is a chunk of its own (ADR-0225): a conversation nobody decorates
 * loads the smiley and nothing else, and a failed fetch renders nothing rather
 * than taking the route down (docs/specs/offline-first.md, #332).
 */
const EmojiPickerPanel = dynamic(
  tolerateChunkFailure('emoji picker', () =>
    import('./emoji-picker').then((module) => ({ default: module.EmojiPickerPanel }))
  ),
  { ssr: false }
);

/** Fetches the catalog on the hover or focus that is about to need it. */
export function prefetchEmojiPicker(): void {
  void import('./emoji-picker').catch(() => undefined);
}

/**
 * The emoji tray a composer draws under its row, and the way it goes away.
 *
 * It is not a floating surface: below `lg` it sits in the composer's flow, so
 * the row above it stays visible and the thread shrinks by exactly the height
 * the on-screen keyboard would have taken (`100dvh` plus
 * `frontend/ui/shared/keyboard-inset.ts` already do that arithmetic). Above
 * `lg` the wrapper is positioned over the message list, where a docked tray
 * would cost the thread its room.
 *
 * The dismissal rules are the ones a keyboard-switch panel has: a press
 * anywhere outside closes it, Escape closes it and puts the caret back in the
 * field, and the smiley itself is the switch rather than an outside press — it
 * reports its own state, so closing it here would close and reopen it on the
 * same tap.
 */
export function EmojiTray({
  open,
  labels,
  onPick,
  onClose,
}: {
  open: boolean;
  labels: ChatEmojiLabels;
  /** Writes the glyph at the caret the field kept across the blur. */
  onPick: (glyph: string) => void;
  /** Closed from outside; `focusField` puts the caret back for a keyboard. */
  onClose: (focusField: boolean) => void;
}) {
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (wrapper.current?.contains(target)) return;
      if (target.closest('[data-emoji-toggle]')) return;
      onClose(false);
    };

    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={wrapper}
      // Escape belongs to the tray while it is open: without the stop it would
      // reach the assistant panel's dialog and close the whole conversation.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }}
      className="mt-2 w-full duration-200 animate-in fade-in-0 slide-in-from-bottom-2 lg:absolute lg:inset-x-auto lg:end-0 lg:bottom-full lg:z-50 lg:mb-2 lg:mt-0 lg:w-[21rem]"
    >
      <EmojiPickerPanel labels={labels} onPick={onPick} />
    </div>
  );
}
