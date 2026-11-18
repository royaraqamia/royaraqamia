'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';
import { HomeMotionRoot } from '@/frontend/ui/home/HomeMotionRoot';
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

const block = 'animate-pulse rounded-xl border border-border/40 bg-muted/20';

/** Rows of a shape a tab actually draws, instead of one fixed-height box. */
function SkeletonRows({ rows, height }: { rows: number; height: string }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={block} style={{ height }} />
      ))}
    </div>
  );
}

/** The first screen of each tab, so its frame does not jump when the chunk lands. */
const SKELETON_SHAPES: Record<HomeServiceKey, ReactNode> = {
  '/news': (
    <>
      <div className={`${block} h-11 w-2/3`} />
      <SkeletonRows rows={3} height="10rem" />
    </>
  ),
  '/rates': <SkeletonRows rows={7} height="3.5rem" />,
  '/scan': (
    <>
      <div className={`${block} aspect-video w-full`} />
      <SkeletonRows rows={3} height="3.5rem" />
    </>
  ),
  '/quran': (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className={`${block} h-20`} />
      ))}
    </div>
  ),
  '/athkar': <SkeletonRows rows={8} height="3.5rem" />,
  '/notes': <SkeletonRows rows={5} height="4rem" />,
  '/habitflow': (
    <>
      <div className={`${block} mb-4 h-12`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${block} h-28`} />
        ))}
      </div>
    </>
  ),
  '/spendtrack': (
    <>
      <div className={`${block} mb-4 h-12`} />
      <div className="grid grid-cols-2 gap-3">
        <div className={`${block} h-44`} />
        <div className={`${block} h-44`} />
      </div>
    </>
  ),
  '/linksnap': (
    <>
      <div className={`${block} h-48`} />
      <SkeletonRows rows={4} height="4rem" />
    </>
  ),
};

function SurfaceSkeleton({ tab }: { tab: HomeServiceKey }) {
  return (
    <div
      aria-busy="true"
      aria-label={HOME_COPY.surfaceLoading}
      className="mx-auto flex w-full flex-col gap-3 px-4 pt-6"
    >
      {SKELETON_SHAPES[tab]}
    </div>
  );
}

const loadingFor = (tab: HomeServiceKey) => () => <SurfaceSkeleton tab={tab} />;

const NewsSurface = dynamic(
  () =>
    import('@/frontend/ui/news/news-surface').then((module) => ({ default: module.NewsSurface })),
  { loading: loadingFor('/news'), ssr: false }
);
const RatesSurface = dynamic(
  () =>
    import('@/frontend/ui/rates/rates-surface').then((module) => ({
      default: module.RatesSurface,
    })),
  { loading: loadingFor('/rates'), ssr: false }
);
const ScanSurface = dynamic(
  () =>
    import('@/frontend/ui/scan/scan-surface').then((module) => ({
      default: module.ScanSurface,
    })),
  { loading: loadingFor('/scan'), ssr: false }
);
const QuranSurface = dynamic(
  () =>
    import('@/frontend/ui/quran/quran-surface').then((module) => ({
      default: module.QuranSurface,
    })),
  { loading: loadingFor('/quran'), ssr: false }
);
const AthkarSurface = dynamic(
  () =>
    import('@/frontend/ui/athkar/athkar-surface').then((module) => ({
      default: module.AthkarSurface,
    })),
  { loading: loadingFor('/athkar'), ssr: false }
);
const NotesSurface = dynamic(
  () =>
    import('@/frontend/ui/notes/notes-surface').then((module) => ({
      default: module.NotesSurface,
    })),
  { loading: loadingFor('/notes'), ssr: false }
);
const HabitflowSurface = dynamic(
  () =>
    import('@/frontend/ui/habitflow/habitflow-surface').then((module) => ({
      default: module.HabitflowSurface,
    })),
  { loading: loadingFor('/habitflow'), ssr: false }
);
const SpendtrackSurface = dynamic(
  () =>
    import('@/frontend/ui/spendtrack/spendtrack-surface').then((module) => ({
      default: module.SpendtrackSurface,
    })),
  { loading: loadingFor('/spendtrack'), ssr: false }
);
const LinkSnapSurface = dynamic(
  () =>
    import('@/frontend/ui/linksnap/linksnap-surface').then((module) => ({
      default: module.LinkSnapSurface,
    })),
  { loading: loadingFor('/linksnap'), ssr: false }
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
  '/news': 'mx-auto w-full max-w-4xl px-4 pt-10',
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
      {MOTION_ROUTES.has(tab) ? <HomeMotionRoot>{content}</HomeMotionRoot> : content}
    </div>
  );
}
