'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import { cn } from '@/frontend/shared/cn';
import { MotionRoot } from '@/frontend/ui/MotionRoot';
import type { HomeServiceKey } from '@/shared/contracts/home-services-catalog';

import { HOME_COPY } from './home-copy';

/**
 * The app the strip selected, drawn under it (ADR-0151).
 *
 * Each surface is the same component its route renders, imported lazily so the
 * door ships the picker's weight and not eleven apps' code; the tab is a
 * selection, never a navigation, and `/` stays the address bar's answer.
 *
 * The three frames are the ones the routes already draw: the public tools own
 * their `max-w`, the local-first apps sit in the AppShell's band, and Quran and
 * Athkar bring their own container. The surface is content; the frame is here so
 * a route and its tab cannot drift apart by a padding class.
 */

function SurfaceSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label={HOME_COPY.surfaceLoading}
      className="mx-auto w-full max-w-5xl px-4 pt-6"
    >
      <div className="h-96 animate-pulse rounded-3xl border border-border/40 bg-muted/20" />
    </div>
  );
}

const loading = () => <SurfaceSkeleton />;

const NewsSurface = dynamic(
  () =>
    import('@/frontend/ui/news/news-surface').then((module) => ({ default: module.NewsSurface })),
  { loading, ssr: false }
);
const RatesSurface = dynamic(
  () =>
    import('@/frontend/ui/rates/rates-surface').then((module) => ({
      default: module.RatesSurface,
    })),
  { loading, ssr: false }
);
const ScanSurface = dynamic(
  () =>
    import('@/frontend/ui/scan/scan-surface').then((module) => ({
      default: module.ScanSurface,
    })),
  { loading, ssr: false }
);
const QuranSurface = dynamic(
  () =>
    import('@/frontend/ui/quran/quran-surface').then((module) => ({
      default: module.QuranSurface,
    })),
  { loading, ssr: false }
);
const AthkarSurface = dynamic(
  () =>
    import('@/frontend/ui/athkar/athkar-surface').then((module) => ({
      default: module.AthkarSurface,
    })),
  { loading, ssr: false }
);
const NotesSurface = dynamic(
  () =>
    import('@/frontend/ui/notes/notes-surface').then((module) => ({
      default: module.NotesSurface,
    })),
  { loading, ssr: false }
);
const HabitflowSurface = dynamic(
  () =>
    import('@/frontend/ui/habitflow/habitflow-surface').then((module) => ({
      default: module.HabitflowSurface,
    })),
  { loading, ssr: false }
);
const SpendtrackSurface = dynamic(
  () =>
    import('@/frontend/ui/spendtrack/spendtrack-surface').then((module) => ({
      default: module.SpendtrackSurface,
    })),
  { loading, ssr: false }
);
const LinkSnapSurface = dynamic(
  () =>
    import('@/frontend/ui/linksnap/linksnap-surface').then((module) => ({
      default: module.LinkSnapSurface,
    })),
  { loading, ssr: false }
);

function NotesTab() {
  return <NotesSurface embedded />;
}

const SURFACES: Record<HomeServiceKey, ComponentType> = {
  '/news': NewsSurface,
  '/rates': RatesSurface,
  '/scan': ScanSurface,
  '/quran': QuranSurface,
  '/athkar': AthkarSurface,
  '/linksnap': LinkSnapSurface,
  '/habitflow': HabitflowSurface,
  '/spendtrack': SpendtrackSurface,
  '/notes': NotesTab,
};

/** The frame the route draws around a surface, repeated for the tab. */
const FRAMES: Record<HomeServiceKey, string> = {
  '/news': 'pt-10',
  '/rates': 'pt-6',
  '/scan': '',
  '/quran': '',
  '/athkar': '',
  '/notes': 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6',
  '/habitflow': 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6',
  '/spendtrack': 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6',
  '/linksnap': 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6',
};

/** The two surfaces whose animation primitives need `MotionRoot` on the route. */
const MOTION_ROUTES = new Set<HomeServiceKey>(['/habitflow', '/linksnap']);

export function HomeAppSurface({ tab }: { tab: HomeServiceKey | null }) {
  if (!tab) return null;

  const Surface = SURFACES[tab];
  const content = <Surface />;

  return (
    <div className={cn('pb-28', FRAMES[tab])}>
      {MOTION_ROUTES.has(tab) ? <MotionRoot>{content}</MotionRoot> : content}
    </div>
  );
}
