import { ChatsLocalStore } from '@/frontend/api/chats/local-store';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { ChatAgentAllowance, ChatMessage, ChatThread } from '@/shared/contracts/chat';

/**
 * What the floating assistant paints before the server answers (ADR-0150).
 *
 * The panel is the thread's short conversation, and a conversation that blanks
 * to a spinner every time it is opened reads as a page that forgot the member.
 * The newest page is already on the device — the thread screen writes it there —
 * so the panel reads it the same way and revalidates behind the paint.
 *
 * Two pieces, both small:
 *
 * - the conversation itself, in the identity's Local Store (`headers`,
 *   `messages`), which is the same cache the full thread draws from and is
 *   cleared by a sign-out with everything else in that namespace;
 * - the answer the panel needs to pick a face before any request — which thread
 *   this member owns, and whether their plan may ask at all. That is a few
 *   hundred bytes in `localStorage`, partitioned by identity, and never an
 *   authorization: RLS still decides what a read returns.
 *
 * The identity the store is opened for gates a cache read, but a cache write is
 * stamped by the store's own namespace; there is no path where one account's
 * panel can paint another account's rows.
 */

const SNAPSHOT_PREFIX = 'royaraqamia:assistant:';

/** What the panel needs to choose its first face without a request. */
export interface AssistantSnapshot {
  /** The member's one assistant thread, once it has been seen. */
  threadId: string | null;
  /** The deployment's answer from the last read. */
  available: boolean;
  /** The last known meters; the live read replaces it. */
  allowance: ChatAgentAllowance | null;
}

/** A previous visit's page, read from the identity's Local Store. */
export interface CachedConversation {
  thread: ChatThread;
  messages: ChatMessage[];
}

function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    // A sandboxed iframe or a private mode that throws: a cache miss is fine.
    return null;
  }
}

function snapshotKey(identity: LocalIdentity): string {
  return `${SNAPSHOT_PREFIX}${identity}`;
}

function isAllowance(value: unknown): value is ChatAgentAllowance {
  if (!value || typeof value !== 'object') return false;
  const allowance = value as Record<string, unknown>;
  const member = allowance.member as Record<string, unknown> | undefined;
  const project = allowance.project as Record<string, unknown> | undefined;
  const apps = allowance.apps as Record<string, unknown> | undefined;
  return (
    typeof allowance.plan === 'string' &&
    typeof allowance.resetsAt === 'string' &&
    !!member &&
    typeof member.used === 'number' &&
    typeof member.cap === 'number' &&
    !!project &&
    typeof project.used === 'number' &&
    typeof project.limit === 'number' &&
    // A snapshot written before the app meter (#1226) has no `apps`; it is a
    // cache miss rather than a composer that draws `undefined`.
    !!apps &&
    typeof apps.used === 'number' &&
    typeof apps.cap === 'number' &&
    typeof apps.connected === 'number'
  );
}

/** The last answer for this identity, or null where there is nothing usable. */
export function readAssistantSnapshot(identity: LocalIdentity): AssistantSnapshot | null {
  const storage = browserStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(snapshotKey(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const threadId = typeof parsed.threadId === 'string' ? parsed.threadId : null;
    return {
      threadId,
      available: parsed.available !== false,
      allowance: isAllowance(parsed.allowance) ? parsed.allowance : null,
    };
  } catch {
    return null;
  }
}

/** Records the face the server just answered, for the next open. */
export function writeAssistantSnapshot(identity: LocalIdentity, snapshot: AssistantSnapshot): void {
  const storage = browserStorage();
  if (!storage) return;

  try {
    storage.setItem(snapshotKey(identity), JSON.stringify(snapshot));
  } catch {
    // A full or unavailable store only costs the next open its head start.
  }
}

/** Forgets the remembered thread — a conversation that no longer exists. */
export function forgetAssistantThread(identity: LocalIdentity): void {
  const storage = browserStorage();
  if (!storage) return;

  try {
    const snapshot = readAssistantSnapshot(identity);
    if (!snapshot) return;
    storage.setItem(
      snapshotKey(identity),
      JSON.stringify({ ...snapshot, threadId: null, allowance: null })
    );
  } catch {
    // Same as the write: a cache hint, not state the panel depends on.
  }
}

/** The last page this device held for the thread, or null with no cache. */
export async function readCachedConversation(
  identity: LocalIdentity,
  threadId: string
): Promise<CachedConversation | null> {
  try {
    const store = await ChatsLocalStore.open(identity);
    const [thread, messages] = await Promise.all([
      store.getThread(threadId),
      store.getMessages(threadId),
    ]);
    if (!thread) return null;
    return { thread, messages };
  } catch {
    // IndexedDB refused or is unavailable: fall through to the network.
    return null;
  }
}

/** Writes the page the panel just read into the same store the thread uses. */
export async function saveCachedConversation(
  identity: LocalIdentity,
  thread: ChatThread,
  messages: readonly ChatMessage[]
): Promise<void> {
  try {
    const store = await ChatsLocalStore.open(identity);
    await store.saveThread(thread);
    await store.saveMessages(thread.id, messages, { replace: true });
  } catch {
    // A cache that cannot be written is a slower next open, not a failed one.
  }
}
