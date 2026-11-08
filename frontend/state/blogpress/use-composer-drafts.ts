'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlogpressLocalStore, type DraftSaveInput } from '@/frontend/api/blogpress/local-store';
import { BlogpressSyncEngine } from '@/frontend/api/blogpress/sync-engine';
import { createBlogpressHttpSyncTransport } from '@/frontend/api/blogpress/sync-transport';
import { publishPost, schedulePost } from '@/frontend/api/blogpress';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { GUEST_IDENTITY, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { logger } from '@/frontend/shared/logger';
import type { PostStatus } from '@/shared/contracts/blogpress';

export interface ComposerDraftInput {
  id?: string;
  slug?: string;
  content: string;
  coverImage?: string;
  metaTitle?: string;
  metaDesc?: string;
  status?: PostStatus;
  publishAt?: string | null;
}

export interface ComposerDrafts {
  ready: boolean;
  online: boolean;
  /** Creates or updates a draft in the Local Store and queues its replay. */
  saveDraft: (input: ComposerDraftInput) => Promise<{ id: string; slug: string }>;
  /** Deletes a draft locally and queues the tombstone. */
  deleteDraft: (id: string) => Promise<void>;
  /** Publishes now; online-only, as publishing is server-authoritative. */
  publishDraft: (id: string) => Promise<void>;
  /** Schedules; online-only, as the scheduler lives on the server. */
  scheduleDraft: (id: string, publishAt: string) => Promise<void>;
  /** Flushes anything queued, so a caller can publish a freshly created draft. */
  flush: () => Promise<void>;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function newDraftId(): string {
  return uuidv7();
}

function draftSlug(id: string): string {
  return `post-${id.slice(0, 8)}`;
}

/**
 * The composer's draft store. A draft is local-first (ADR-0027/0029): the write
 * lands in the identity's IndexedDB and an Outbox intent carries it to the
 * server, so a body typed offline is never lost. Publishing and scheduling stay
 * online-only, because both are server-owned transitions (ADR-0031).
 */
export function useComposerDrafts(identity: LocalIdentity, enabled = true): ComposerDrafts {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const storeRef = useRef<BlogpressLocalStore | null>(null);
  const engineRef = useRef<BlogpressSyncEngine | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setOnline(isOnline());
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setReady(false);
      return;
    }
    setReady(false);
    let cancelled = false;
    let opened: BlogpressLocalStore | null = null;

    BlogpressLocalStore.open(identity)
      .then(async (store) => {
        opened = store;
        if (cancelled) return;
        // A guest's drafts belong to the account it signs into (ADR-0027).
        if (identity !== GUEST_IDENTITY) {
          const guest = await BlogpressLocalStore.open(GUEST_IDENTITY);
          try {
            await store.claimFrom(guest);
          } finally {
            guest.close();
          }
          if (cancelled) return;
        }
        storeRef.current = store;
        setReady(true);
      })
      .catch((error) => {
        logger.error('Failed to open the composer draft store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      storeRef.current = null;
      opened?.close();
      setReady(false);
    };
  }, [identity, enabled]);

  // The engine only exists for the session that owns the store; a guest keeps
  // their drafts locally and the account store claims them on sign-in.
  useEffect(() => {
    const store = storeRef.current;
    if (!ready || !store || identity === GUEST_IDENTITY) return;

    const engine = new BlogpressSyncEngine({
      store,
      transport: createBlogpressHttpSyncTransport(store),
      isSignedIn: () => true,
    });
    engineRef.current = engine;

    const run = () => {
      if (!isOnline()) return;
      void engine.flush();
    };
    window.addEventListener('online', run);
    window.addEventListener('focus', run);
    const unsubscribeWrites = store.subscribeWrites(() => {
      void flushOutbox(engine);
    });
    run();

    return () => {
      unsubscribeWrites();
      window.removeEventListener('online', run);
      window.removeEventListener('focus', run);
      engine.dispose();
      engineRef.current = null;
    };
  }, [ready, identity]);

  const saveDraft = useCallback(async (input: ComposerDraftInput) => {
    const store = storeRef.current;
    if (!store) throw new Error('draft store is not ready');
    const id = input.id ?? newDraftId();
    const slug = input.slug || draftSlug(id);
    const payload: DraftSaveInput & { isNew?: boolean } = {
      id,
      slug,
      content: input.content,
      coverImage: input.coverImage ?? '',
      metaTitle: input.metaTitle ?? '',
      metaDesc: input.metaDesc ?? '',
      status: input.status,
      publishAt: input.publishAt,
      isNew: input.id ? undefined : true,
    };
    await store.saveDraft(payload);
    return { id, slug };
  }, []);

  const deleteDraft = useCallback(async (id: string) => {
    await storeRef.current?.deleteDraft(id);
  }, []);

  const flush = useCallback(async () => {
    await engineRef.current?.flush();
  }, []);

  const publishDraft = useCallback(async (id: string) => {
    if (!isOnline()) throw new Error('publishing needs a connection');
    await engineRef.current?.flush();
    await publishPost(id);
  }, []);

  const scheduleDraft = useCallback(async (id: string, publishAt: string) => {
    if (!isOnline()) throw new Error('scheduling needs a connection');
    await engineRef.current?.flush();
    await schedulePost(id, publishAt);
  }, []);

  return useMemo(
    () => ({ ready, online, saveDraft, deleteDraft, publishDraft, scheduleDraft, flush }),
    [ready, online, saveDraft, deleteDraft, publishDraft, scheduleDraft, flush]
  );
}
