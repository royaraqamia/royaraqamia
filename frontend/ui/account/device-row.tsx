'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { HardDrive } from 'lucide-react';

import { rowClasses } from '@/frontend/ui/account/row-classes';

/** Once per tab: the shell only has to land in the worker's cache once. */
const WARMED_KEY = 'royaraqamia:device-shell-warmed';

/**
 * The `/account` entry to the device's own data (#370).
 *
 * A plain link for guests and members alike — the page is local-only, so there
 * is nothing to gate. It also warms its shell: `/device` is the one
 * account-adjacent surface that has to exist with the radio off, and a route
 * never visited online has no cached document to serve. The link's prefetch
 * brings the route's chunks and RSC payload; this fetch brings the document
 * itself, through the worker, once per tab.
 */
export function DeviceRow() {
  useEffect(() => {
    if (typeof fetch !== 'function') return;

    try {
      if (sessionStorage.getItem(WARMED_KEY)) return;
      sessionStorage.setItem(WARMED_KEY, '1');
    } catch {
      // Private modes can refuse sessionStorage; warming twice is only a cost.
    }

    void fetch('/device', {
      headers: { accept: 'text/html' },
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, []);

  return (
    <Link href="/device" prefetch className={rowClasses}>
      <span className="flex items-center gap-2.5">
        <HardDrive className="w-4 h-4 shrink-0 text-primary" />
        <span>بيانات هذا الجهاز</span>
      </span>
      <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
        ←
      </span>
    </Link>
  );
}
