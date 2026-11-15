import type { AiChatClient } from '@/backend/clients/ai-chat';
import { logger } from '@/backend/shared/logger';
import { memoryRefusal } from '@/backend/shared/domain/agent-memory';
import {
  EXTRACTION_PROVIDER_TIMEOUT_MS,
  EXTRACTION_SYSTEM_PROMPT,
  extractionPrompt,
  parseExtractedFacts,
  parseExtractionJson,
  type SettledTurn,
} from '@/backend/shared/domain/memory-extraction';
import type { AgentMemoryService } from '@/backend/services/agent/agent-memory-service';

/**
 * Facts after the answer (ADR-0182 decision 2, decision 5, #1511).
 *
 * It is a second caller of `remember`, never a second writer: the refusal, the
 * normalisation, the duplicate answer and the vector all stay in the one door
 * #1509 landed. What this service adds is what nobody typed — a schema, a floor,
 * and one stated sentence for the kinds decision 5 singles out.
 *
 * **Nothing it does can reach the member.** It runs after the answer is stored
 * and the turn is settled, on work the response never awaits, and every failure
 * — provider, schema, database, timeout — is one warning. A fact that is not
 * extracted is a fact the member can say again; a turn broken by extraction is
 * an answer they cannot get back.
 */
export interface MemoryExtractionService {
  /** One turn, one attempt. Never throws: the caller has already answered. */
  extract(turn: SettledTurn): Promise<void>;
}

export interface MemoryExtractionDeps {
  /** The one door. Its refusals are the decision-5 list, applied once. */
  memories: Pick<AgentMemoryService, 'remember'>;
  /** Takes the turn's single attempt; false means somebody already has it. */
  claim(turnId: string, at: string): Promise<boolean>;
  /** `null` when the deployment has no key: extraction is simply off. */
  client: Pick<AiChatClient, 'reply'> | null;
  now?: () => number;
}

export function createMemoryExtractionService({
  memories,
  claim,
  client,
  now = Date.now,
}: MemoryExtractionDeps): MemoryExtractionService {
  return {
    async extract(turn) {
      if (!client) return;

      // No member words, nothing to extract from. A resumed turn can carry no
      // question at all, and the answer alone is the assistant's own voice.
      if (!turn.question.trim()) return;

      // Decision 5's hardest case, checked before the claim and before any
      // provider spend: nobody typed this, so a turn that carries a credential
      // is not read at all. `remember` refuses these too, but a paraphrase is
      // what extraction writes, so the turn itself is what has to be clean.
      if (memoryRefusal(turn.question) || memoryRefusal(turn.answer)) return;

      let owned: boolean;
      try {
        owned = await claim(turn.turnId, new Date(now()).toISOString());
      } catch (error) {
        logger.warn('Memory extraction could not claim its turn', {
          turn: turn.turnId,
          error: String(error),
        });
        return;
      }
      if (!owned) return;

      try {
        const raw = await client.reply(
          [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: extractionPrompt(turn) },
          ],
          AbortSignal.timeout(EXTRACTION_PROVIDER_TIMEOUT_MS)
        );

        const facts = parseExtractedFacts(parseExtractionJson(raw), {
          target: { threadId: turn.conversationId, product: turn.product },
          question: turn.question,
        });

        for (const fact of facts) {
          try {
            // One bad fact is one lost fact, not a lost exchange: the door's
            // own refusal must not stop the next row from being offered.
            await memories.remember({
              userId: turn.userId,
              text: fact.text,
              kind: fact.kind,
              scope: fact.scope,
              product: fact.product,
              threadId: fact.threadId,
              sourceTurnId: turn.turnId,
              confidence: fact.confidence,
            });
          } catch (error) {
            logger.warn('Memory extraction could not save a fact', {
              turn: turn.turnId,
              error: String(error),
            });
          }
        }
      } catch (error) {
        // Provider outage, a timeout, an unreadable answer: the turn keeps its
        // answer, its allowance and its `settled` state. This is the only trace.
        logger.warn('Memory extraction failed', { turn: turn.turnId, error: String(error) });
      }
    },
  };
}
