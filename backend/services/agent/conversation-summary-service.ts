import type { AiChatClient } from '@/backend/clients/ai-chat';
import { logger } from '@/backend/shared/logger';
import {
  SUMMARY_PROVIDER_TIMEOUT_MS,
  SUMMARY_SYSTEM_PROMPT,
  summaryChunk,
  summaryDue,
  summaryPrompt,
  summaryText,
  type ConversationSummary,
} from '@/backend/shared/domain/conversation-summary';
import type {
  ConversationSummaryReader,
  ConversationSummaryWriter,
} from '@/backend/repositories/chat/conversation-summary-repository';

/**
 * The rolling summary of a conversation (ADR-0182 decision 4, #1512).
 *
 * Two halves, and the seam between them is the model's own cost line. `read` is
 * what a turn injects and never spends anything: it is one row read on the
 * member's own session, and a failure is a turn without the block. `refresh` is
 * the provider call, and it is *conditional* — only once the thread is past the
 * window and at least ten messages have arrived since the cursor. A summary that
 * regenerated on every message would be a provider call per message for a
 * paragraph that changed by one line, which is precisely the cost decision 4
 * exists to avoid.
 *
 * **Nothing here can refuse a member an answer.** `refresh` runs after the
 * answer is stored and the turn is settled, on work the response never awaits,
 * and every failure — provider, schema, database, timeout — is one warning. The
 * previous summary is left exactly as it was, because the only write is the one
 * that follows a successful call.
 */
export interface ConversationSummaryService {
  /** What this turn injects, or `null`. Never throws. */
  read(conversationId: string): Promise<ConversationSummary | null>;
  /** Regenerates if the gate says it is due. Never throws. */
  refresh(conversationId: string): Promise<void>;
}

export interface ConversationSummaryDeps {
  /** The member's own session: the conversation policy is the boundary. */
  read: Pick<ConversationSummaryReader, 'find'>;
  /** The service role: the messages, the counts and the write. */
  write: ConversationSummaryWriter;
  /** `null` when the deployment has no key: the summary is read, never written. */
  client: Pick<AiChatClient, 'reply'> | null;
  now?: () => number;
}

export function createConversationSummaryService({
  read,
  write,
  client,
  now = Date.now,
}: ConversationSummaryDeps): ConversationSummaryService {
  return {
    async read(conversationId) {
      try {
        return await read.find(conversationId);
      } catch (error) {
        // A conversation whose summary cannot be read is a turn without the
        // block — the window below it is unchanged, and the answer still lands.
        logger.warn('Conversation summary unavailable', {
          conversation: conversationId,
          error: String(error),
        });
        return null;
      }
    },

    async refresh(conversationId) {
      if (!client) return;

      try {
        const current = await write.find(conversationId);
        const cursor = current?.throughMessageId ?? null;
        const { total, unseen } = await write.progress(conversationId, cursor);

        // The gate is checked before the messages are read and before any
        // provider spend: one new message already sits in the window, and a
        // thread inside the window has nothing the summary could carry.
        if (!summaryDue({ total, unseen })) return;

        const chunk = summaryChunk(await write.unseen(conversationId, cursor));
        // Nothing readable after the cursor (every message a tombstone): there
        // is no cursor to move, so there is nothing to write either.
        if (chunk.through === null) return;

        const raw = await client.reply(
          [
            { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
            {
              role: 'user',
              content: summaryPrompt({
                previous: current?.text ?? '',
                messages: chunk.messages,
              }),
            },
          ],
          AbortSignal.timeout(SUMMARY_PROVIDER_TIMEOUT_MS)
        );

        const text = summaryText(raw);
        // An empty answer is not a summary: keeping the previous one is the
        // whole difference between a stale block and a blank one.
        if (!text) return;

        await write.save({
          conversationId,
          text,
          through: chunk.through,
          previous: cursor,
          at: new Date(now()).toISOString(),
        });
      } catch (error) {
        // Provider outage, a timeout, an unreadable answer, a refused write:
        // the turn keeps its answer, its allowance and the summary it had.
        logger.warn('Conversation summary could not be regenerated', {
          conversation: conversationId,
          error: String(error),
        });
      }
    },
  };
}
