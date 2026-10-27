'use client';

/**
 * The router stub issue #500 asks for: `next/navigation` for a surface that is
 * rendered by Vite instead of Next.
 *
 * The spike bundles one owned surface (`/habitflow`) into the APK, so the page's
 * components keep their `next/navigation` imports but run outside the App
 * Router. The stub answers the same questions from module state: where are we
 * (`usePathname`, `useSearchParams`) and what does a navigation do
 * (`useRouter`). `next.config`/Vite aliases point here for both the dev build
 * and `vite build` (`vite.config.ts`).
 *
 * A navigation to a *remote* surface is not swallowed by the stub: the owned/
 * remote split is the thing being proven, so `push` hands the URL to the
 * crossing module (`./crossing`) and the chosen mechanism decides how the app
 * leaves the bundled origin. Every other path just moves the stub's own
 * location, which is enough for a one-route spike.
 */

import { useSyncExternalStore } from 'react';

import { isRemoteSurface, openRemote, remoteMechanism } from '../crossing';

export interface SpikeLocation {
  pathname: string;
  search: string;
}

const BUNDLED_START: SpikeLocation = { pathname: '/habitflow', search: '' };

let location: SpikeLocation = BUNDLED_START;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The stub's current location, for the spike's own panel and for tests. */
export function spikeLocation(): SpikeLocation {
  return location;
}

/** Parse a Next-style href into the stub's location. */
function toLocation(href: string): SpikeLocation {
  const url = new URL(href, 'https://localhost');
  return { pathname: url.pathname, search: url.search };
}

/**
 * Move the stub, or leave the bundled origin when the href names a remote
 * surface. `https://royaraqamia.com/...` is treated as remote for the same
 * reason: it is the live site, and a bundled shell must not pretend it owns it.
 */
export function navigate(href: string): void {
  const next = toLocation(href);
  if (isRemoteSurface(href, next.pathname)) {
    void openRemote(next.pathname, next.search, remoteMechanism());
    return;
  }

  location = next;
  listeners.forEach((listener) => listener());
}

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => location.pathname,
    () => BUNDLED_START.pathname
  );
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribe,
    () => location.search,
    () => BUNDLED_START.search
  );
  return new URLSearchParams(search);
}

export function useParams(): Record<string, string | string[]> {
  return {};
}

export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
    back: () => {
      window.history.back();
    },
    forward: () => {
      window.history.forward();
    },
    refresh: () => {
      window.location.reload();
    },
    prefetch: () => {},
  };
}

/** `notFound()` in the App Router renders the segment's not-found page; here it throws. */
export function notFound(): never {
  throw new Error('notFound() is not implemented by the spike router stub');
}

/** `redirect()` in the App Router answers with a redirect response; here it navigates. */
export function redirect(href: string): never {
  navigate(href);
  throw new Error(`redirect(${href})`);
}
