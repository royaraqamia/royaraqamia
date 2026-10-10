'use client';

import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';

/**
 * SpendTrack's header sync state; renders nothing outside the provider. The
 * `data-spendtrack-ready` marker lets the offline E2E wait until the Local Store
 * is open before it drives a write.
 */
export function SpendtrackSyncStatus() {
  const context = useSpendtrackContext();
  if (!context) return null;
  return (
    <div data-spendtrack-ready={context.ready ? 'true' : 'false'}>
      <SyncStatusPill status={context} />
    </div>
  );
}
