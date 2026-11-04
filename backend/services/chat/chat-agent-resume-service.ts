import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AgentTurnRow,
  ChatAgentRepository,
} from '@/backend/repositories/chat/chat-agent-repository';
import type { Database } from '@/backend/models/database.types';
import type { AgentTurnSession } from '@/backend/services/chat/agent-turn-session';
import type { ChatAgentService } from '@/backend/services/chat/chat-agent-service';
import { logger } from '@/backend/shared/logger';

/**
 * Finishing a turn whose request is gone (ADR-0125).
 *
 * The row is the claim: `claimTurn` is a compare-and-set on the lease, so two
 * workers — the cron wake and a second wake a minute later — cannot write the
 * same answer twice. A turn is answered as the member, through a session minted
 * for the length of that turn and released afterwards.
 *
 * It takes nothing from the member: the message is already in the thread and the
 * allowance was reserved by the request that opened the turn.
 */
export interface ChatAgentResumeDeps {
  turns: Pick<ChatAgentRepository, 'dueTurns' | 'claimTurn'>;
  openSession(userId: string): Promise<AgentTurnSession | null>;
  /** The assistant, over the minted session, so every read runs under RLS. */
  service(supabase: SupabaseClient<Database>): ChatAgentService;
}

export interface ChatAgentResumeResult {
  /** Turns the wake found, before any lease was attempted. */
  due: number;
  /** Turns this worker claimed and finished. */
  resumed: number;
  /** Turns another worker won, or whose session could not be minted. */
  skipped: number;
}

/** The address a write tool would see. A resumed turn never runs one. */
const WORKER_IP = 'worker';

export class ChatAgentResumeService {
  constructor(private readonly deps: ChatAgentResumeDeps) {}

  async run(limit = 1): Promise<ChatAgentResumeResult> {
    const ids = await this.deps.turns.dueTurns(limit);
    let resumed = 0;
    let skipped = 0;

    for (const id of ids) {
      const turn = await this.deps.turns.claimTurn(id);
      // Another worker holds the lease, or the turn stopped being abandoned.
      if (!turn) {
        skipped += 1;
        continue;
      }

      const session = await this.deps.openSession(turn.memberId);
      if (!session) {
        // Transient by nature (a minting outage): the row keeps running, and the
        // lease expiring is what retries it. After three attempts it stops.
        logger.warn('Assistant turn could not open a session', { turn: turn.id });
        skipped += 1;
        continue;
      }

      try {
        await this.answer(turn, session);
        resumed += 1;
      } catch (error) {
        // The service already recorded the failure on the row.
        logger.warn('Assistant turn could not be resumed', {
          turn: turn.id,
          error: String(error),
        });
      } finally {
        await session.release();
      }
    }

    return { due: ids.length, resumed, skipped };
  }

  private async answer(turn: AgentTurnRow, session: AgentTurnSession): Promise<void> {
    const service = this.deps.service(session.supabase);
    for await (const _event of service.resume(turn, {
      supabase: session.supabase,
      ip: WORKER_IP,
    })) {
      // Nobody is watching: the answer is the row the service wrote, and the
      // thread's Realtime subscription is what shows it.
    }
  }
}
