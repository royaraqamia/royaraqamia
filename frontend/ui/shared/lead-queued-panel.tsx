'use client';

import { CloudUpload } from 'lucide-react';
import { SyncStatusPill, type SyncPillStatus } from '@/frontend/ui/shared/sync-status-pill';

interface LeadQueuedPanelProps {
  /** The reassurance shown to the visitor; the Reference Code arrives later. */
  message: string;
  status: SyncPillStatus;
}

/**
 * The confirmation a lead form shows when its submission is durable locally but
 * not yet on the server (ADR-0027, ticket #169). It is deliberately not the
 * Reference Code panel: the code is server-minted, so the honest thing to show
 * is "kept on this device, sending when we can" — and the panel flips to the
 * real confirmation the moment the Outbox replay lands the code.
 */
export function LeadQueuedPanel({ message, status }: LeadQueuedPanelProps) {
  return (
    <div className="p-6 sm:p-10 text-center" role="status">
      <CloudUpload className="mx-auto mb-5 size-12 text-primary" aria-hidden="true" />

      <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">
        حُفِظ طلبك على هذا الجهاز
      </h2>

      <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
        {message}
      </p>

      <div className="mt-6 flex justify-center">
        <SyncStatusPill status={status} />
      </div>
    </div>
  );
}
