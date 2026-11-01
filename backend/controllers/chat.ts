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
  type ChatPreview,
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

/** A policy refusal answers with its own status; anything else is a 500. */
function chatFailure(fallback: string) {
  return (error: unknown): HttpResult => {
    if (error instanceof ChatError) {
      return jsonResult(
        error.status,
        { success: false, error: error.message },
        { headers: NO_STORE }
      );
    }
    return jsonResult(500, { success: false, error: fallback }, { headers: NO_STORE });
  };
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'بيانات غير صالحة';
}

export async function listChatThreads(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const threads = await createSupabaseChatService(supabase).listThreads(userId);
      return jsonResult(
        200,
        { success: true, threads } satisfies {
          success: true;
          threads: ChatConversationSummary[];
        },
        { headers: NO_STORE }
      );
    },
    { mapError: chatFailure('تعذّر تحميل المحادثات') }
  );
}

export async function getChatThread(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const thread = await createSupabaseChatService(supabase).getThread(userId, id);
      if (!thread)
        return jsonResult(
          404,
          { success: false, error: 'المحادثة غير موجودة' },
          { headers: NO_STORE }
        );
      return jsonResult(
        200,
        { success: true, thread } satisfies {
          success: true;
          thread: ChatThread;
        },
        { headers: NO_STORE }
      );
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = StartDirectChatSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      const result = await createSupabaseChatService(supabase).startDirect(
        userId,
        parsed.data.userId
      );
      return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر بدء المحادثة') }
  );
}

export async function listChatMessages(id: string, cursor: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const page = await createSupabaseChatService(supabase).listMessages(userId, id, cursor);
      return jsonResult(
        200,
        { success: true, ...page } satisfies {
          success: true;
        } & ChatMessagePage,
        { headers: NO_STORE }
      );
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = ChatMessageSendSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      const message = await createSupabaseChatService(supabase).sendMessage(
        userId,
        id,
        parsed.data
      );
      return jsonResult(
        201,
        { success: true, message } satisfies {
          success: true;
          message: ChatMessage;
        },
        { headers: NO_STORE }
      );
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = ChatMessageEditSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      const message = await createSupabaseChatService(supabase).editMessage(
        userId,
        messageId,
        parsed.data.body
      );
      return jsonResult(200, { success: true, message }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر تعديل الرسالة') }
  );
}

export async function deleteChatMessage(messageId: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      await createSupabaseChatService(supabase).deleteMessage(userId, messageId);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const answer = body.answer === 'accept' || body.answer === 'decline' ? body.answer : null;
      if (!answer) {
        return jsonResult(
          400,
          { success: false, error: 'الإجابة غير صالحة' },
          { headers: NO_STORE }
        );
      }

      await createSupabaseChatService(supabase).respond(userId, id, answer);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر تنفيذ الطلب') }
  );
}

/** The requester takes a pending request back; it closes for both sides. */
export async function withdrawChat(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      await createSupabaseChatService(supabase).withdraw(userId, id);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر إلغاء الطلب') }
  );
}

/** Ask again on a closed thread: the same conversation goes back to waiting. */
export async function requestChat(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      await createSupabaseChatService(supabase).reopen(userId, id);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر إرسال الطلب') }
  );
}

export async function leaveChat(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      await createSupabaseChatService(supabase).leave(userId, id);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = ChatReadSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      await createSupabaseChatService(supabase).markRead(userId, id, parsed.data.at);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = ChatReportSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      const reportId = await createSupabaseChatService(supabase).report(
        id,
        parsed.data.reason,
        parsed.data.reportedUserId ?? null
      );
      return jsonResult(200, { success: true, reportId }, { headers: NO_STORE });
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
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const blockedId = typeof body.userId === 'string' ? body.userId : null;
      if (!blockedId)
        return jsonResult(
          400,
          { success: false, error: 'معرِّف العضو مطلوب' },
          { headers: NO_STORE }
        );

      await createSupabaseChatService(supabase).block(userId, blockedId);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر حظر العضو') }
  );
}

export async function unblockChatUser(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      await createSupabaseChatService(supabase).unblock(userId, id);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر إلغاء الحظر') }
  );
}

export async function listBlockedChatUsers(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const blocked = await createSupabaseChatService(supabase).listBlocked(userId);
      return jsonResult(200, { success: true, blocked }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر تحميل قائمة الحظر') }
  );
}

/** Members you can start a thread with — the "new chat" picker's search. */
export async function searchChatMembers(query: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!query) return jsonResult(200, { success: true, members: [] }, { headers: NO_STORE });
      const members = await createSupabaseChatService(supabase).searchMembers(userId, query);
      return jsonResult(200, { success: true, members }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر البحث عن الأعضاء') }
  );
}

/** The pre-chat screen: the member a handle names, and the thread already open. */
export async function previewChat(to: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const preview = await createSupabaseChatService(supabase).preview(userId, to ?? '');
      return jsonResult(
        200,
        { success: true, ...preview } satisfies { success: true } & ChatPreview,
        { headers: NO_STORE }
      );
    },
    { mapError: chatFailure('تعذّر تحميل بيانات العضو') }
  );
}
