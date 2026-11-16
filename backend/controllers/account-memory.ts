import { createAgentMemoryFor } from '@/backend/config/agent-memory';
import { AppError } from '@/backend/shared/errors';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import {
  AgentMemoryEditSchema,
  AgentMemorySettingsPatchSchema,
  type AgentMemoryActionResult,
  type AgentMemoryListResult,
} from '@/shared/contracts/agent-memory';

/**
 * The memory page's routes (ADR-0182 decision 6, #1428).
 *
 * One controller for the five things the page can do: read the facts and the
 * switches, edit one, forget one, change the switches, export, and (from the
 * thread) forget a conversation. Each handler parses, calls once and shapes the
 * answer; the store, the one door's refusals and the transaction that deletes a
 * vector belong to `AgentMemoryService` and the database.
 *
 * Every response is account data, so every one is `no-store`: the seam adds it,
 * and the export adds its own disposition on top.
 */

const CROSS_ORIGIN_REFUSAL = 'طلب من أصل غير معروف.';
const INVALID_REQUEST = 'الطلب غير مكتمل.';
const NOT_FOUND = 'لا يوجد شيء بهذا المعرّف.';
const FAILED = 'تعذّر إتمام الطلب. الرجاء المحاولة مرة أخرى.';

/** A refusal keeps its own status and sentence; anything else is a 500. */
function memoryFailure(fallback: string) {
  return (error: unknown): HttpResult => {
    if (error instanceof AppError) {
      return jsonResult(error.statusCode, { success: false, error: error.message });
    }
    return jsonResult(500, { success: false, error: fallback });
  };
}

function refusedSameOrigin(): HttpResult {
  return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
}

/** The page's read: the facts, newest first, and the three switches. */
export async function readAgentMemory(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const memories = createAgentMemoryFor(supabase);
      const [facts, settings] = await Promise.all([
        memories.list(userId),
        memories.settings(userId),
      ]);

      const body: AgentMemoryListResult = { success: true, facts, settings };
      return jsonResult(200, body, { headers: NO_STORE });
    },
    { mapError: memoryFailure(FAILED) }
  );
}

/** One fact's text or kind. A row that is not the caller's is a 404, not a 403. */
export async function editAgentMemory(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) return refusedSameOrigin();

      const parsed = AgentMemoryEditSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: INVALID_REQUEST });
      }

      const updated = await createAgentMemoryFor(supabase).edit(userId, id, parsed.data);
      if (!updated) return jsonResult(404, { success: false, error: NOT_FOUND });

      const answer: AgentMemoryActionResult = { success: true };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: memoryFailure(FAILED) }
  );
}

/** Forget one fact: the row and its vector, in one transaction. */
export async function forgetAgentMemory(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ supabase }) => {
      if (!isSameOrigin(headers)) return refusedSameOrigin();

      const forgotten = await createAgentMemoryFor(supabase).forget(id);
      const answer: AgentMemoryActionResult = forgotten
        ? { success: true }
        : { success: false, error: NOT_FOUND };
      return jsonResult(forgotten ? 200 : 404, answer, { headers: NO_STORE });
    },
    { mapError: memoryFailure(FAILED) }
  );
}

/** The per-scope switches. */
export async function saveAgentMemorySettings(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) return refusedSameOrigin();

      const parsed = AgentMemorySettingsPatchSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: INVALID_REQUEST });
      }

      const settings = await createAgentMemoryFor(supabase).saveSettings(userId, parsed.data);
      const answer: AgentMemoryListResult = { success: true, settings };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: memoryFailure(FAILED) }
  );
}

/**
 * The export: the data the page draws, as a file.
 *
 * Deliberately the rows and not a rendering. A rendering would need the page's
 * words in the backend, and the page's words are generated copy for two clients
 * — a second copy written here would be the drift `check:copy` exists to stop.
 * A member who wants to read what is remembered has the page; a member who wants
 * to take it elsewhere has this.
 */
export async function exportAgentMemory(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const memories = createAgentMemoryFor(supabase);
      const [facts, settings] = await Promise.all([
        memories.list(userId),
        memories.settings(userId),
      ]);

      return jsonResult(
        200,
        { exportedAt: new Date().toISOString(), settings, facts },
        {
          headers: {
            ...NO_STORE,
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': 'attachment; filename="royaraqamia-memory.json"',
          },
        }
      );
    },
    { mapError: memoryFailure(FAILED) }
  );
}

/**
 * "Forget this conversation", from the thread's own menu.
 *
 * The count is the answer: 0 is a conversation where nothing was remembered,
 * which is a different sentence from a failure and must not read as one.
 */
export async function forgetConversationMemory(
  conversationId: string,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ supabase }) => {
      if (!isSameOrigin(headers)) return refusedSameOrigin();

      const forgotten = await createAgentMemoryFor(supabase).forgetThread(conversationId);
      const answer: AgentMemoryActionResult = { success: true, forgot: forgotten };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: memoryFailure(FAILED) }
  );
}
