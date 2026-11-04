import { describe, expect, it, vi } from 'vitest';

import type {
  AgentTurnRow,
  ChatAgentRepository,
} from '@/backend/repositories/chat/chat-agent-repository';
import type { AgentTurnSession } from '@/backend/services/chat/agent-turn-session';
import type { ChatAgentService } from '@/backend/services/chat/chat-agent-service';
import { ChatAgentResumeService } from '@/backend/services/chat/chat-agent-resume-service';

const TURN: AgentTurnRow = {
  id: 'turn-1',
  conversationId: 'conversation-1',
  memberId: 'user-1',
  question: 'سؤال',
  resumes: 1,
};

function session(): AgentTurnSession & { release: ReturnType<typeof vi.fn> } {
  return {
    supabase: {} as never,
    release: vi.fn(async () => undefined),
  };
}

function makeService(
  overrides: {
    claim?: () => Promise<AgentTurnRow | null>;
    openSession?: () => Promise<AgentTurnSession | null>;
    resume?: (turn: AgentTurnRow, context: unknown) => AsyncGenerator<unknown>;
  } = {}
) {
  const turns = {
    dueTurns: vi.fn(async () => [TURN.id]),
    claimTurn: vi.fn(overrides.claim ?? (async () => TURN)),
  } satisfies Pick<ChatAgentRepository, 'dueTurns' | 'claimTurn'>;

  const openSession = vi.fn(overrides.openSession ?? (async () => session()));
  const resume = vi.fn(overrides.resume ?? async function* () {});
  const service = new ChatAgentResumeService({
    turns,
    openSession,
    service: () => ({ resume }) as unknown as ChatAgentService,
  });

  return { service, turns, openSession, resume };
}

describe('resuming an abandoned turn (ADR-0125)', () => {
  it('claims the row, answers as the member, and gives the session back', async () => {
    const held = session();
    const { service, resume } = makeService({
      openSession: async () => held,
    });

    const result = await service.run(1);

    expect(result).toMatchObject({ due: 1, resumed: 1, skipped: 0 });
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume.mock.calls[0]?.[0]).toBe(TURN);
    expect(held.release).toHaveBeenCalledTimes(1);
  });

  it('does nothing when another worker holds the lease', async () => {
    const { service, resume, openSession } = makeService({ claim: async () => null });

    const result = await service.run(1);

    expect(result).toMatchObject({ due: 1, resumed: 0, skipped: 1 });
    expect(openSession).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('leaves the row running when a session cannot be minted, so the wake retries', async () => {
    const { service, resume } = makeService({ openSession: async () => null });

    const result = await service.run(1);

    expect(result).toMatchObject({ due: 1, resumed: 0, skipped: 1 });
    expect(resume).not.toHaveBeenCalled();
  });

  it('gives the session back even when the answer throws', async () => {
    const held = session();
    const { service } = makeService({
      openSession: async () => held,
      resume: async function* () {
        yield* [];
        throw new Error('provider down');
      },
    });

    const result = await service.run(1);

    expect(result.resumed).toBe(0);
    expect(held.release).toHaveBeenCalledTimes(1);
  });
});
