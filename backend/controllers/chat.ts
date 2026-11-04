import {
  createChatAgentResumeService,
  createSupabaseChatAgentActionService,
  createSupabaseChatAgentService,
  createSupabaseChatService,
} from '@/backend/config/chat';
import * as Sentry from '@sentry/nextjs';

import { createPlanGate } from '@/backend/config/plans';
import { isCronAuthorized } from '@/backend/shared/cron-auth';
import { planRefusalResult } from '@/backend/middleware/http';
import { NO_STORE } from '@/backend/transport/cache-policy';
import {
  withAuthenticatedStream,
  withAuthenticatedUser,
} from '@/backend/transport/session-handler';
import { isSameOrigin, getClientIpFromHeaders } from '@/backend/transport/http';
import { jsonResult, toNextResponse, type HttpResult } from '@/backend/transport/http-result';
import { ChatAgentError } from '@/backend/services/chat/chat-agent-service';
import { ChatError } from '@/backend/services/chat/chat-service';
import { OWNED_ITEMS } from '@/shared/contracts/plans';
import {
  ChatAddParticipantsSchema,
  ChatAgentTurnSchema,
  ChatMessageEditSchema,
  ChatMessageSendSchema,
  ChatReadSchema,
  ChatReportSchema,
  CreateGroupChatSchema,
  StartDirectChatSchema,
  type ChatAgentEvent,
  type ChatAssistantState,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessagePage,
  type ChatPreview,
  type ChatThread,
} from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

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

/**
 * A policy refusal answers with its own status; anything else is a 500.
 *
 * A plan refusal (`OwnedItemCapReachedError`, 402 + `owned_item_cap`) is an
 * `AppError` rather than a `ChatError`, and its sentence is the upgrade nudge —
 * so it keeps its own status and code instead of collapsing into the fallback.
 */
function chatFailure(fallback: string) {
  return (error: unknown): HttpResult => {
    if (error instanceof ChatError) {
      return jsonResult(
        error.status,
        { success: false, error: error.message },
        { headers: NO_STORE }
      );
    }
    const refusal = planRefusalResult(error);
    if (refusal) return { ...refusal, headers: NO_STORE };

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

/**
 * A named group. The plan cap is asked here, before any row exists: the
 * pre-check is what answers the upgrade nudge, and the trigger on
 * `chat_conversations` is what makes the cap true for a caller that skips this
 * route entirely (#526, ADR-0113).
 */
export async function createChatGroup(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = CreateGroupChatSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      await createPlanGate().cap(userId, OWNED_ITEMS.chatGroups);

      const result = await createSupabaseChatService(supabase).startGroup(userId, parsed.data);
      return jsonResult(201, { success: true, ...result }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر إنشاء المجموعة') }
  );
}

/** Invite more members into a group the caller is active in. */
export async function addChatMembers(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const parsed = ChatAddParticipantsSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: firstIssue(parsed.error) },
          { headers: NO_STORE }
        );
      }

      const result = await createSupabaseChatService(supabase).addMembers(
        userId,
        id,
        parsed.data.memberIds
      );
      return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّرت دعوة الأعضاء') }
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

/**
 * One attachment's signed URL. The response is the only place the URL appears:
 * the object path is never sent to a client, and the URL expires in a minute,
 * so a copy taken from the response reads nothing by the time it is replayed.
 */
export async function getChatAttachment(
  conversationId: string,
  attachmentId: string
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const file = await createSupabaseChatService(supabase).attachmentUrl(
        userId,
        conversationId,
        attachmentId
      );

      return jsonResult(
        200,
        { success: true, ...file } satisfies {
          success: true;
          url: string;
          fileName: string;
          mimeType: string;
          inline: boolean;
        },
        { headers: NO_STORE }
      );
    },
    { mapError: chatFailure('تعذّر تجهيز الملف') }
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

/**
 * The assistant (ADR-0113, #817).
 *
 * The thread is created on first open — one per member, no title — and the two
 * reads below say what the composer may do: whether a provider key exists, and
 * how much of today's allowance is left. Neither answer is an error when the
 * assistant is off or spent; the thread stays readable and the composer names
 * the state.
 */
export async function startChatAssistant(headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const result = await createSupabaseChatService(supabase).startAssistant(userId);
      return jsonResult(201, { success: true, ...result }, { headers: NO_STORE });
    },
    { mapError: chatFailure('تعذّر فتح المحادثة مع المساعد') }
  );
}

/** What the assistant's composer needs before it draws: availability and meters. */
export async function getChatAssistant(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const state = await createSupabaseChatAgentService(supabase).state(userId);
      return jsonResult(
        200,
        { success: true, ...state } satisfies { success: true } & ChatAssistantState,
        { headers: NO_STORE }
      );
    },
    { mapError: chatFailure('تعذّر تحميل حالة المساعد') }
  );
}

/**
 * One assistant turn, answered as an event stream.
 *
 * This is the chats surface's only handler that writes its body after the
 * response exists, so it returns a `Response` rather than an `HttpResult`: the
 * refusal for a request that cannot start (not signed in, not the member,
 * allowance spent) is still a JSON status, and only a turn that reserved its
 * allowance opens a stream. Each frame is one JSON event — a text delta, the
 * stored reply, or the sentence explaining why the turn stopped.
 */
export async function streamChatAgentTurn(
  id: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<Response> {
  return withAuthenticatedStream(async ({ userId, supabase }) => {
    if (!isSameOrigin(headers)) {
      return toNextResponse(
        jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE })
      );
    }

    const parsed = ChatAgentTurnSchema.safeParse(body);
    if (!parsed.success) {
      return toNextResponse(
        jsonResult(400, { success: false, error: firstIssue(parsed.error) }, { headers: NO_STORE })
      );
    }

    const service = createSupabaseChatAgentService(supabase);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (event: ChatAgentEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          for await (const event of service.turn(
            userId,
            id,
            parsed.data.body ?? '',
            {
              supabase,
              ip: getClientIpFromHeaders(headers),
            },
            parsed.data.attachment
          )) {
            write(event);
          }
        } catch (error) {
          write({ type: 'error', error: agentTurnFailure(error) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        // Vercel's proxy buffers a stream unless told not to, which would hold
        // the whole answer until the turn finished.
        'X-Accel-Buffering': 'no',
      },
    });
  });
}

/** A turn's failure, in the one sentence its stream carries to the composer. */
function agentTurnFailure(error: unknown): string {
  if (error instanceof ChatAgentError) return error.message;
  return 'تعذّر الحصول على ردّ من المساعد. حاول مرّة أخرى.';
}

/**
 * The worker: finishes a turn whose request is gone.
 *
 * Called by `wake_agent_turns()` through pg_cron, authenticated with `CRON_SECRET`
 * — the same secret Vercel's cron calls use. One turn per call, because a turn is
 * capped at 55 seconds and this function's ceiling is 60; a backlog drains one
 * wake a minute, which is exactly the case it exists for.
 */
export async function runChatAgentTurns(headers: Headers): Promise<HttpResult> {
  if (!isCronAuthorized(headers)) {
    return jsonResult(401, { success: false, error: 'غير مصرح' }, { headers: NO_STORE });
  }

  try {
    const result = await createChatAgentResumeService().run(1);
    return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(
      500,
      {
        success: false,
        error: error instanceof Error ? error.message : 'تعذّر إكمال الدور',
      },
      { headers: NO_STORE }
    );
  }
}

/**
 * The member's answer to a proposal (ADR-0113, #818).
 *
 * Confirming runs the write — on the member's own session, through the
 * product's own service — and answers the row as it now stands. A refusal is
 * not an HTTP failure: it is the `failed` row with the reason the card draws,
 * which is what makes a plan cap read as a sentence instead of a broken screen.
 * A replay (`already resolved`) is a 409, because the row is a record of one
 * resolution and the caller asked for a second.
 */
export async function confirmChatAgentAction(
  id: string,
  actionId: string,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const action = await createSupabaseChatAgentActionService(supabase).confirm(
        userId,
        id,
        actionId,
        { supabase, ip: getClientIpFromHeaders(headers) }
      );

      return jsonResult(
        200,
        {
          success: true,
          action,
          error: action.status === 'failed' ? reasonOf(action) : undefined,
        } satisfies {
          success: true;
          action: ChatAgentAction;
          error?: string;
        },
        { headers: NO_STORE }
      );
    },
    {
      mapError: (error) =>
        error instanceof ChatAgentError
          ? jsonResult(
              error.status,
              { success: false, error: error.message },
              { headers: NO_STORE }
            )
          : chatFailure('تعذّر تنفيذ الإجراء')(error),
    }
  );
}

/** Declining writes `rejected` and nothing else happens. */
export async function rejectChatAgentAction(
  id: string,
  actionId: string,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' }, { headers: NO_STORE });
      }

      const action = await createSupabaseChatAgentActionService(supabase).reject(
        userId,
        id,
        actionId
      );

      return jsonResult(
        200,
        { success: true, action } satisfies { success: true; action: ChatAgentAction },
        { headers: NO_STORE }
      );
    },
    {
      mapError: (error) =>
        error instanceof ChatAgentError
          ? jsonResult(
              error.status,
              { success: false, error: error.message },
              { headers: NO_STORE }
            )
          : chatFailure('تعذّر إلغاء الإجراء')(error),
    }
  );
}

function reasonOf(action: ChatAgentAction): string | undefined {
  const error = action.result?.error;
  return typeof error === 'string' ? error : undefined;
}
