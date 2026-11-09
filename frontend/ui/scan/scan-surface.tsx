'use client';

import '@/app/scan/app.css';

import { ScanPage } from './scan-page';

/**
 * The scanner, without the route: `/scan` renders `ScanPage` directly and the
 * homepage renders this wrapper, which is the same component plus the surface's
 * stylesheet loaded with its chunk (ADR-0151).
 */
export function ScanSurface() {
  return <ScanPage />;
}
