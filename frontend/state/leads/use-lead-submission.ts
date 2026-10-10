'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrainingApplicationInput } from '@/shared/contracts/training';
import type { ProjectRequestInput } from '@/shared/contracts/project-requests';
import type { RetainerInput } from '@/shared/contracts/retainers';
import { submitTrainingApplication } from '@/frontend/api/training';
import { submitProjectRequest } from '@/frontend/api/project-requests';
import { submitRetainer } from '@/frontend/api/retainers';
import { LeadsLocalStore } from '@/frontend/api/leads/local-store';
import {
  LEAD_INTENT_TYPES,
  createLeadHttpSyncTransport,
  leadKindForIntent,
  type LeadFormKind,
} from '@/frontend/api/leads/sync-transport';
import { SyncEngine, type SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { logger } from '@/frontend/shared/logger';

const LEADS_SYNC_LOCK = 'leads-sync';
const LEADS_SYNC_CHANNEL = 'leads-sync';
const SYNCED_MESSAGE = 'leads:synced';

/** The submit payload for one lead form; `client_id` is minted by the hook. */
export type LeadSubmitInput =
  | { kind: 'training'; value: Omit<TrainingApplicationInput, 'client_id'> }
  | { kind: 'projectRequest'; value: Omit<ProjectRequestInput, 'client_id'> }
  | { kind: 'retainer'; value: Omit<RetainerInput, 'client_id'> };

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

const EMPTY_STATUS: SyncStatus = { syncing: false, pending: 0, failed: 0, lastError: null };

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Sends a lead straight to its endpoint, carrying the client-minted key. */
function dispatch(input: LeadSubmitInput, clientId: string): Promise<SubmitResult> {
  switch (input.kind) {
    case 'training':
      return submitTrainingApplication({ ...input.value, client_id: clientId });
    case 'projectRequest':
      return submitProjectRequest({ ...input.value, client_id: clientId });
    case 'retainer':
      return submitRetainer({ ...input.value, client_id: clientId });
  }
}

/**
 * Owns the lead-form Outbox and its Sync Engine (ADR-0029, ticket #169). The
 * three non-inventory forms share one durable queue: a submission made with the
 * network off is enqueued and replayed on reconnection, and the transport writes
 * the Reference Code back to the submission receipt so the form can show it.
 *
 * Leads are anonymous, so the queue flushes regardless of session (`isSignedIn`
 * is always true) — the server attributes a signed-in submitter via the cookie.
 */
export function useLeadSubmission(): LeadSubmissionState {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  const storeRef = useRef<LeadsLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let opened: LeadsLocalStore | null = null;
    let engine: SyncEngine | null = null;
    let channel: BroadcastChannel | null = null;

    const refreshEntries = async (store: LeadsLocalStore) => {
      const next = await store.getOutbox();
      if (!cancelled) setEntries(next);
    };

    LeadsLocalStore.open()
      .then((store) => {
        opened = store;
        storeRef.current = store;
        setReady(true);

        const unsubscribe = store.subscribeWrites(() => void refreshEntries(store));
        void refreshEntries(store);

        engine = new SyncEngine(
          {
            store,
            transport: createLeadHttpSyncTransport(),
            isSignedIn: () => true,
            onStatus: (next) => {
              setStatus(next);
              void refreshEntries(store);
            },
            broadcast: (message) => channel?.postMessage(message),
          },
          {
            lockName: LEADS_SYNC_LOCK,
            channelName: LEADS_SYNC_CHANNEL,
            logLabel: 'LeadOutbox',
            syncedMessage: SYNCED_MESSAGE,
          }
        );
        engineRef.current = engine;

        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(LEADS_SYNC_CHANNEL);
          channel.onmessage = () => void refreshEntries(store);
        }

        void engine.flush();
        return unsubscribe;
      })
      .catch((error) => {
        logger.error('Failed to open the lead Outbox', { error: String(error) });
      });

    return () => {
      cancelled = true;
      channel?.close();
      opened?.close();
      engineRef.current = null;
      storeRef.current = null;
      setReady(false);
    };
  }, []);

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

  const submit = useCallback(async (input: LeadSubmitInput): Promise<LeadSubmitOutcome> => {
    const clientId = uuidv7();
    const type = LEAD_INTENT_TYPES[input.kind];
    const store = storeRef.current;

    // Offline with a ready queue: never touch the network, land it in the Outbox.
    if (store && !isOnline()) {
      await store.enqueue({
        entity: 'lead',
        type,
        payload: { ...input.value, client_id: clientId },
      });
      return { status: 'queued' };
    }

    const result = await dispatch(input, clientId);

    if (result.success && result.referenceCode) {
      return { status: 'sent', referenceCode: result.referenceCode };
    }

    // No HTTP status means the request never reached the server (a dropped
    // connection, an aborted fetch) — queue it rather than lose the submission.
    if (store && result.status === undefined) {
      await store.enqueue({
        entity: 'lead',
        type,
        payload: { ...input.value, client_id: clientId },
      });
      return { status: 'queued' };
    }

    return {
      status: 'error',
      error: result.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.',
    };
  }, []);

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
      pendingKinds,
      submit,
      retry,
    }),
    [ready, online, status, pendingKinds, submit, retry]
  );
}
