'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/frontend/ui/primitives/sheet';
import { AppsSurface } from '@/frontend/ui/apps/apps-surface';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import type { AppsTab } from '@/shared/contracts/mcp-marketplace';

import type { NavLink } from './NavDropdown';
import { SERVICES_SHEET_COPY } from './services-sheet-copy';

const loadStoreTab = () => import('@/frontend/ui/apps/store-tab');
const loadInboundTab = () => import('@/frontend/ui/apps/inbound-tab');

function TabChunkSkeleton() {
  return <div className="h-20 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />;
}

const LazyStoreTab = dynamic(
  tolerateChunkFailure('store tab', () =>
    loadStoreTab().then((module) => ({ default: module.StoreTab }))
  ),
  { loading: TabChunkSkeleton }
);

const LazyInboundTab = dynamic(
  tolerateChunkFailure('inbound tab', () =>
    loadInboundTab().then((module) => ({
      default: module.InboundTab,
    }))
  ),
  { loading: TabChunkSkeleton }
);

export interface ServicesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: NavLink;
  /** The control that opens the sheet; focus returns here when it closes. */
  triggerId: string;
  contentId: string;
}

/**
 * The apps surface as a full-height sheet, with no trigger of its own (ADR-0146).
 *
 * Split from `NavDropdown`/`ServicesMenu` so the sheet primitive (portal, focus
 * scope, scroll lock) is fetched on first open instead of riding in the initial
 * graph of every primary route. The callers keep the visible control, which is a
 * plain button — Radix would otherwise have to be there before the first frame
 * just to render it.
 *
 * The three tabs are the sheet's whole content now, so the two MCP panels are
 * lazy boundaries: opening the sheet loads the picker and nothing else, and a
 * tab pays for its own chunk the first time it is chosen.
 */
export function ServicesSheet({
  open,
  onOpenChange,
  link,
  triggerId,
  contentId,
}: ServicesSheetProps) {
  // The trigger means "apps", so every open starts on our own list rather than
  // on whichever tab was read last.
  const [tab, setTab] = useState<AppsTab>('internal');

  // The open itself never waits on these chunks: once the sheet is on screen,
  // the two other tabs are warmed in the background so a tap draws at once.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void loadStoreTab().catch(() => {});
      void loadInboundTab().catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setTab('internal');
        onOpenChange(next);
      }}
    >
      <SheetContent
        id={contentId}
        side="bottom"
        data-visual="services-sheet"
        // The title alone names the sheet; there is no description line to point at.
        aria-describedby={undefined}
        className="h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden rounded-none p-0 sm:mx-auto sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-3xl"
        onCloseAutoFocus={(event) => {
          // There is no primitive Trigger to return focus to, so it is ours to do.
          event.preventDefault();
          (document.getElementById(triggerId) as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader
          data-visual="apps-sheet-header"
          className="flex-row items-center gap-3 border-b border-border/40 px-4 pb-3 pt-[max(0.75rem,var(--roy-safe-top))] pe-14"
        >
          <SheetTitle className="text-lg font-extrabold">{SERVICES_SHEET_COPY.title}</SheetTitle>
        </SheetHeader>

        <AppsSurface
          host="sheet"
          tab={tab}
          subItems={link.subItems}
          onTabChange={setTab}
          StoreTab={LazyStoreTab}
          InboundTab={LazyInboundTab}
        />
      </SheetContent>
    </Sheet>
  );
}
