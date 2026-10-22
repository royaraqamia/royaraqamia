'use client';

import { useEffect } from 'react';
import { markShell } from '@/frontend/shared/perf-marks';

/**
 * The layout's half of the launch measurement (#487): the first committed frame
 * of the chrome is the `shell` mark. `boot` is marked in
 * `instrumentation-client.ts` and `content` in the product dashboards, so this
 * is the only piece the root layout renders — and it renders nothing.
 */
export function AppPerfObserver() {
  useEffect(() => {
    markShell();
  }, []);

  return null;
}
