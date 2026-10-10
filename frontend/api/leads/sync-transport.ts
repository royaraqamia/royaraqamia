import { request } from '@/frontend/transport/http';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';
import { writeSubmissionReceipt, type SubmissionKind } from '@/frontend/shared/submission-receipt';

/** The three non-inventory lead forms that queue offline (ticket #169). */
export type LeadFormKind = Extract<SubmissionKind, 'training' | 'projectRequest' | 'retainer'>;

/** Outbox intent type per lead form. */
export const LEAD_INTENT_TYPES: Record<LeadFormKind, string> = {
  training: 'training.submit',
  projectRequest: 'project-request.submit',
  retainer: 'retainer.submit',
};

const INTENT_ENDPOINTS: Record<string, string> = {
  [LEAD_INTENT_TYPES.training]: '/api/training/applications',
  [LEAD_INTENT_TYPES.projectRequest]: '/api/project-requests',
  [LEAD_INTENT_TYPES.retainer]: '/api/retainers',
};

const INTENT_KINDS: Record<string, LeadFormKind> = {
  [LEAD_INTENT_TYPES.training]: 'training',
  [LEAD_INTENT_TYPES.projectRequest]: 'projectRequest',
  [LEAD_INTENT_TYPES.retainer]: 'retainer',
};

/** The lead form an Outbox intent belongs to, or `null` for an unknown type. */
export function leadKindForIntent(type: string): LeadFormKind | null {
  return INTENT_KINDS[type] ?? null;
}

/**
 * Replays a lead-form Outbox intent against the existing submit endpoint. The
 * payload already carries the client-minted `client_id`, so the POST is an
 * idempotent submit: a retry of a write whose response was lost returns the row
 * it already created instead of duplicating the lead. On success the returned
 * Reference Code is written to the submission receipt, which is what flips the
 * still-mounted form to its confirmation (ticket #169).
 */
export function createLeadHttpSyncTransport(): SyncTransport {
  return {
    async send(entry) {
      const endpoint = INTENT_ENDPOINTS[entry.type];
      if (!endpoint) throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);

      const result = await request<{ referenceCode?: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(entry.payload),
      });

      const kind = INTENT_KINDS[entry.type];
      if (kind && result?.referenceCode) {
        writeSubmissionReceipt(kind, result.referenceCode);
      }
    },
  };
}
