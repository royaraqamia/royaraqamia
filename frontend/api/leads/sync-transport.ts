import { request } from '@/frontend/transport/http';
import {
  GUEST_IDENTITY,
  identityUserId,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';
import { writeSubmissionReceipt, type SubmissionKind } from '@/frontend/shared/submission-receipt';

/** The non-inventory lead forms that queue offline (ticket #169). */
export type LeadFormKind = Extract<
  SubmissionKind,
  'training' | 'projectRequest' | 'retainer' | 'subscription'
>;

/** Outbox intent type per lead form. */
export const LEAD_INTENT_TYPES: Record<LeadFormKind, string> = {
  training: 'training.submit',
  projectRequest: 'project-request.submit',
  retainer: 'retainer.submit',
  subscription: 'subscription.submit',
};

const INTENT_ENDPOINTS: Record<string, string> = {
  [LEAD_INTENT_TYPES.training]: '/api/training/applications',
  [LEAD_INTENT_TYPES.projectRequest]: '/api/project-requests',
  [LEAD_INTENT_TYPES.retainer]: '/api/retainers',
  [LEAD_INTENT_TYPES.subscription]: '/api/me/subscriptions',
};

const INTENT_KINDS: Record<string, LeadFormKind> = {
  [LEAD_INTENT_TYPES.training]: 'training',
  [LEAD_INTENT_TYPES.projectRequest]: 'projectRequest',
  [LEAD_INTENT_TYPES.retainer]: 'retainer',
  [LEAD_INTENT_TYPES.subscription]: 'subscription',
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
 *
 * `identity` is the Outbox partition this transport drains. A subscription is
 * the one lead whose server row belongs to an account, so it may only be
 * replayed from that account's partition, carrying that account's id: a queue
 * left behind by a signed-out member must never be written under the next
 * member's session (#1084). The server enforces the same rule; this is the half
 * that keeps the request from being sent at all.
 */
export function createLeadHttpSyncTransport(
  identity: LocalIdentity = GUEST_IDENTITY
): SyncTransport {
  const accountId = identityUserId(identity);

  return {
    async send(entry) {
      const endpoint = INTENT_ENDPOINTS[entry.type];
      if (!endpoint) throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);

      if (entry.type === LEAD_INTENT_TYPES.subscription) {
        if (!accountId) {
          throw new PermanentSyncError(
            'طلب الاشتراك محفوظ لحساب صاحبه؛ لا يمكن إعادة إرساله من غير حساب.'
          );
        }
        const submittedBy = (entry.payload as { user_id?: unknown } | null)?.user_id;
        if (submittedBy !== accountId) {
          throw new PermanentSyncError('هذا الطلب أرسله حساب آخر. سجّل الدخول بالحساب الذي أرسله.');
        }
      }

      const result = await request<{ referenceCode?: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(entry.payload),
      });

      const kind = INTENT_KINDS[entry.type];
      if (kind && result?.referenceCode) {
        // Only the account-scoped form names an account; the others keep the
        // device-wide receipt exactly as before.
        if (accountId) writeSubmissionReceipt(kind, result.referenceCode, accountId);
        else writeSubmissionReceipt(kind, result.referenceCode);
      }
    },
  };
}
