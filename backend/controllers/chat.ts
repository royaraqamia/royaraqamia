import { createSupabaseChatService } from '@/backend/config/chat';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { ChatError } from '@/backend/services/chat/chat-service';
import {
  ChatMessageEditSchema,
  ChatMessageSendSchema,
  ChatReadSchema,
  ChatReportSchema,
  StartDirectChatSchema,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessagePage,
  type ChatThread,
} from '@/shared/contracts/chat';

/**
 * The chats surface: what the notifications page's second tab and `/chats/[id]`
 * read, and the six writes the thread can make.
 *
 * Every read is account-scoped, so each response declares `no-store` itself:
 * the session seam's header does not survive a handler that returns its own
 * result (the same reasoning as the notifications controller, #461).
 *
 * The controller stays thin on purpose. Consent, membership, the block check,
 * the edit window and the derived conversation status are the database's
 * (ADR-0113); `ChatService` composes the reads and names the refusals, and this
 * file only parses, calls once and shapes the answer.
 */

function noStore<T>(status: number, body: T): HttpResult {
  return jsonResult(status, body, { headers: NO_STORE });
}

/** A policy refusal answers with its own status; anything else is a 500. */
function chatFailure(fallback: string) {
  return (error: unknown): HttpResult => {
    if (error instanceof ChatError) {
      return noStore(error.status, { success: false, error: error.message });
    }
    return noStore(500, { success: false, error: fallback });
  };
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'بيانات غير صالحة';
}

export async function listChatThreads(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const threads = await createSupabaseChatService(supabase).listThreads(userId);
      return noStore(200, { success: true, threads } satisfies {
        success: true;
        threads: ChatConversationSummary[];
      });
    },
    { mapError: chatFailure('تعذّر تحميل المحادثات') }
  );
}

export async function getChatThread(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const thread = await createSupabaseChatService(supabase).getThread(userId, id);
      if (!thread) return noStore(404, { success: false, error: 'المحادثة غير موجودة' });
      return noStore(200, { success: true, thread } satisfies {
        success: true;
        thread: ChatThread;
      });
    },
    { mapError: chatFailure('تعذّر تحميل المحادثة') }
  );
}

export async function startChat(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = StartDirectChatSchema.safeParse(body);
      if (!parsed.success) {
        return noStore(400, { success: false, error: firstIssue(parsed.error) });
      }

      const result = await createSupabaseChatService(supabase).startDirect(
        userId,
        parsed.data.userId
      );
      return noStore(200, { success: true, ...result });
    },
    { mapError: chatFailure('تعذّر بدء المحادثة') }
  );
}

export async function listChatMessages(id: string, cursor: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const page = await createSupabaseChatService(supabase).listMessages(userId, id, cursor);
      return noStore(200, { success: true, ...page } satisfies {
        success: true;
      } & ChatMessagePage);
    },
    { mapError: chatFailure('تعذّر تحميل الرسائل') }
  );
}

export async function sendChatMessage(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = ChatMessageSendSchema.safeParse(body);
      if (!parsed.success) {
        return noStore(400, { success: false, error: firstIssue(parsed.error) });
      }

      const message = await createSupabaseChatService(supabase).sendMessage(
        userId,
        id,
        parsed.data
      );
      return noStore(201, { success: true, message } satisfies {
        success: true;
        message: ChatMessage;
      });
    },
    { mapError: chatFailure('تعذّر إرسال الرسالة') }
  );
}

export async function editChatMessage(
  messageId: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = ChatMessageEditSchema.safeParse(body);
      if (!parsed.success) {
        return noStore(400, { success: false, error: firstIssue(parsed.error) });
      }

      const message = await createSupabaseChatService(supabase).editMessage(
        userId,
        messageId,
        parsed.data.body
      );
      return noStore(200, { success: true, message });
    },
    { mapError: chatFailure('تعذّر تعديل الرسالة') }
  );
}

export async function deleteChatMessage(messageId: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      await createSupabaseChatService(supabase).deleteMessage(userId, messageId);
      return noStore(200, { success: true });
    },
    { mapError: chatFailure('تعذّر حذف الرسالة') }
  );
}

export async function respondToChat(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const answer = body.answer === 'accept' || body.answer === 'decline' ? body.answer : null;
      if (!answer) {
        return noStore(400, { success: false, error: 'الإجابة غير صالحة' });
      }

      await createSupabaseChatService(supabase).respond(userId, id, answer);
      return noStore(200, { success: true });
    },
    { mapError: chatFailure('تعذّر تنفيذ الطلب') }
  );
}

export async function leaveChat(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      await createSupabaseChatService(supabase).leave(userId, id);
      return noStore(200, { success: true });
    },
    { mapError: chatFailure('تعذّر مغادرة المحادثة') }
  );
}

export async function markChatRead(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = ChatReadSchema.safeParse(body);
      if (!parsed.success) {
        return noStore(400, { success: false, error: firstIssue(parsed.error) });
      }

      await createSupabaseChatService(supabase).markRead(userId, id, parsed.data.at);
      return noStore(200, { success: true });
    },
    { mapError: chatFailure('تعذّر تحديث حالة القراءة') }
  );
}

export async function reportChat(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = ChatReportSchema.safeParse(body);
      if (!parsed.success) {
        return noStore(400, { success: false, error: firstIssue(parsed.error) });
      }

      const reportId = await createSupabaseChatService(supabase).report(
        id,
        parsed.data.reason,
        parsed.data.reportedUserId ?? null
      );
      return noStore(200, { success: true, reportId });
    },
    { mapError: chatFailure('تعذّر إرسال الإبلاغ') }
  );
}

export async function blockChatUser(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      const blockedId = typeof body.userId === 'string' ? body.userId : null;
      if (!blockedId) return noStore(400, { success: false, error: 'معرِّف العضو مطلوب' });

      await createSupabaseChatService(supabase).block(userId, blockedId);
      return noStore(200, { success: true });
    },
    { mapError: chatFailure('تعذّر حظر العضو') }
  );
}

export async function unblockChatUser(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return noStore(403, { success: false, error: 'طلب غير مسموح' });
      }

      await createSupabaseChatService(supabase).unblock(userId, id);
      return noStore(200, { success: true });
    },
    { mapError: chatFailure('تعذّر إلغاء الحظر') }
  );
}

export async function listBlockedChatUsers(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const blocked = await createSupabaseChatService(supabase).listBlocked(userId);
      return noStore(200, { success: true, blocked });
    },
    { mapError: chatFailure('تعذّر تحميل قائمة الحظر') }
  );
}

/** Members you can start a thread with — the "new chat" picker's search. */
export async function searchChatMembers(query: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!query) return noStore(200, { success: true, members: [] });
      const members = await createSupabaseChatService(supabase).searchMembers(userId, query);
      return noStore(200, { success: true, members });
    },
    { mapError: chatFailure('تعذّر البحث عن الأعضاء') }
  );
}
