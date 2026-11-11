'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrainingApplicationInput } from '@/shared/contracts/training';
import type { ProjectRequestInput } from '@/shared/contracts/project-requests';
import type { RetainerInput } from '@/shared/contracts/retainers';
import type { SubscriptionRequestInput } from '@/shared/contracts/subscriptions';
import { submitTrainingApplication } from '@/frontend/api/training';
import { submitProjectRequest } from '@/frontend/api/project-requests';
import { submitRetainer } from '@/frontend/api/retainers';
import { submitSubscriptionRequest } from '@/frontend/api/subscriptions';
import { LeadsLocalStore } from '@/frontend/api/leads/local-store';
import {
  LEAD_INTENT_TYPES,
  createLeadHttpSyncTransport,
  leadKindForIntent,
  type LeadFormKind,
} from '@/frontend/api/leads/sync-transport';
import { LeadsSyncEngine } from '@/frontend/api/leads/sync-engine';
import { SyncEngine, type SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import {
  GUEST_IDENTITY,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { logger } from '@/frontend/shared/logger';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';

/** The submit payload for one lead form; `client_id` is minted by the hook. */
export type LeadSubmitInput =
  | { kind: 'training'; value: Omit<TrainingApplicationInput, 'client_id'> }
  | { kind: 'projectRequest'; value: Omit<ProjectRequestInput, 'client_id'> }
  | { kind: 'retainer'; value: Omit<RetainerInput, 'client_id'> }
  | { kind: 'subscription'; value: Omit<SubscriptionRequestInput, 'client_id'> };

export type LeadSubmitOutcome =
  | { status: 'sent'; referenceCode: string }
  | { status: 'queued' }
  | { status: 'error'; error: string };

export interface LeadSubmissionState {
  /** The Outbox is open and can accept a queued submission. */
  ready: boolean;
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastError: string | null;
  lastFailedType: string | null;
  /** Forms with an intent still waiting in the Outbox, by kind. */
  pendingKinds: ReadonlySet<LeadFormKind>;
  submit: (input: LeadSubmitInput) => Promise<LeadSubmitOutcome>;
  retry: () => void;
}

interface SubmitResult {
  success: boolean;
  referenceCode?: string;
  error?: string;
  status?: number;
}

const EMPTY_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Sends a lead straight to its endpoint, carrying the client-minted key. */
function dispatch(
  input: LeadSubmitInput,
  clientId: string,
  accountId?: string | null
): Promise<SubmitResult> {
  switch (input.kind) {
    case 'training':
      return submitTrainingApplication({ ...input.value, client_id: clientId });
    case 'projectRequest':
      return submitProjectRequest({ ...input.value, client_id: clientId });
    case 'retainer':
      return submitRetainer({ ...input.value, client_id: clientId });
    case 'subscription':
      return submitSubscriptionRequest({
        ...input.value,
        client_id: clientId,
        ...(accountId ? { user_id: accountId } : {}),
      });
  }
}

/**
 * The body a queued intent replays. A subscription carries the account that
 * submitted it, so the replay can be refused if it ever runs under another
 * session (#1084); the anonymous forms carry no account at all.
 */
function queuedPayload(
  input: LeadSubmitInput,
  clientId: string,
  accountId?: string | null
): object {
  if (input.kind === 'subscription' && accountId) {
    return { ...input.value, client_id: clientId, user_id: accountId };
  }
  return { ...input.value, client_id: clientId };
}

/**
 * Owns a lead-form Outbox and its Sync Engine (ADR-0029, ticket #169). The three
 * anonymous forms share the guest queue: a submission made with the network off
 * is enqueued and replayed on reconnection, and the transport writes the
 * Reference Code back to the submission receipt so the form can show it.
 *
 * `accountId` selects the account's queue instead, and the form that passes it
 * is the subscription request — the one whose server row is bound to an account.
 * A subscription queued by A therefore lives in A's namespace, never replays
 * under B's session, and leaves B's form untouched (#1084). The anonymous forms
 * pass nothing and keep flushing regardless of session (`isSignedIn` is always
 * true) — the server attributes a signed-in submitter via the cookie.
 */
export function useLeadSubmission(accountId?: string | null): LeadSubmissionState {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  const storeRef = useRef<LeadsLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const identity: LocalIdentity = accountId ? userIdentity(accountId) : GUEST_IDENTITY;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let opened: LeadsLocalStore | null = null;
    let engine: SyncEngine | null = null;

    // A different account means a different queue: drop the previous one's
    // counts before the new store opens, so nothing on screen claims to be this
    // member's pending work.
    setEntries((current) => (current.length === 0 ? current : []));
    setStatus((current) =>
      current.pending === 0 && current.failed === 0 && current.lastError === null
        ? current
        : EMPTY_STATUS
    );

    const refreshEntries = async (store: LeadsLocalStore) => {
      const next = await store.getOutbox();
      if (!cancelled) setEntries(next);
    };

    LeadsLocalStore.open(identity)
      .then((store) => {
        // The identity changed (or the form unmounted) while the store was
        // opening: this connection belongs to a queue nobody is looking at now.
        if (cancelled) {
          store.close();
          return;
        }

        opened = store;
        storeRef.current = store;
        setReady(true);

        // A queued write is itself a flush trigger while online, so a submission
        // reaches the server promptly instead of waiting for a focus event.
        const unsubscribe = store.subscribeWrites(() => {
          requestPersistentStorageOnce();
          void refreshEntries(store);
          flushOutbox(engineRef.current);
        });
        void refreshEntries(store);

        engine = new LeadsSyncEngine({
          store,
          transport: createLeadHttpSyncTransport(identity),
          isSignedIn: () => true,
          onStatus: (next) => {
            setStatus(next);
            void refreshEntries(store);
          },
        });
        engineRef.current = engine;
        engine.onSync(() => void refreshEntries(store));

        void engine.flush();
        return unsubscribe;
      })
      .catch((error) => {
        logger.error('Failed to open the lead Outbox', { error: String(error) });
      });

    return () => {
      cancelled = true;
      engine?.dispose();
      opened?.close();
      engineRef.current = null;
      storeRef.current = null;
      setReady(false);
    };
  }, [identity]);

  useEffect(() => {
    setOnline(isOnline());

    const onOnline = () => {
      setOnline(true);
      void engineRef.current?.flush();
    };
    const onOffline = () => setOnline(false);
    const onWake = () => void engineRef.current?.flush();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);

  const submit = useCallback(
    async (input: LeadSubmitInput): Promise<LeadSubmitOutcome> => {
      const clientId = uuidv7();
      const type = LEAD_INTENT_TYPES[input.kind];
      const store = storeRef.current;

      // Offline with a ready queue: never touch the network, land it in the Outbox.
      if (store && !isOnline()) {
        await store.enqueue({
          entity: 'lead',
          type,
          payload: queuedPayload(input, clientId, accountId),
        });
        return { status: 'queued' };
      }

      const result = await dispatch(input, clientId, accountId);

      if (result.success && result.referenceCode) {
        return { status: 'sent', referenceCode: result.referenceCode };
      }

      // No HTTP status means the request never reached the server (a dropped
      // connection, an aborted fetch) — queue it rather than lose the submission.
      if (store && result.status === undefined) {
        await store.enqueue({
          entity: 'lead',
          type,
          payload: queuedPayload(input, clientId, accountId),
        });
        return { status: 'queued' };
      }

      return {
        status: 'error',
        error: result.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.',
      };
    },
    [accountId]
  );

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  const pendingKinds = useMemo(() => {
    const kinds = new Set<LeadFormKind>();
    for (const entry of entries) {
      const kind = leadKindForIntent(entry.type);
      if (kind) kinds.add(kind);
    }
    return kinds;
  }, [entries]);

  return useMemo(
    () => ({
      ready,
      online,
      syncing: status.syncing,
      pending: status.pending,
      failed: status.failed,
      lastError: status.lastError,
      lastFailedType: status.lastFailedType,
      pendingKinds,
      submit,
      retry,
    }),
    [ready, online, status, pendingKinds, submit, retry]
  );
}
