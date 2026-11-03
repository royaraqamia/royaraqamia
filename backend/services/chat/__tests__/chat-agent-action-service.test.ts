import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type {
  ChatAgentActionRecord,
  ChatAgentActionRepository,
} from '@/backend/repositories/chat/chat-agent-action-repository';
import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import { AppError } from '@/backend/shared/errors';
import { RepositoryError } from '@/backend/shared/repository-error';
import {
  ChatAgentActionService,
  type ChatAgentActionServiceDeps,
} from '@/backend/services/chat/chat-agent-action-service';
import { ChatAgentError } from '@/backend/services/chat/chat-agent-service';
import type { ChatAgentTool } from '@/backend/services/chat/chat-agent-tools';
import type { ChatService } from '@/backend/services/chat/chat-service';

const CONTEXT = { supabase: {} as never, ip: '127.0.0.1' };

const AGENT_THREAD = { kind: 'agent' } as unknown as Awaited<ReturnType<ChatService['getThread']>>;

function proposal(overrides: Partial<ChatAgentActionRecord> = {}): ChatAgentActionRecord {
  return {
    id: 'action-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    tool: 'record_expense',
    args: { amount: 5, category: 'قهوة' },
    status: 'proposed',
    result: null,
    createdAt: '2026-11-02T08:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

/**
 * The row as the database keeps it: the claim is a compare-and-set, so a second
 * confirmation finds nothing to claim — which is the whole point of the test.
 */
function repository(row: ChatAgentActionRecord) {
  let current = { ...row };
  const writes: string[] = [];

  const repo: ChatAgentActionRepository = {
    listForMessages: vi.fn(async () => [current]),
    find: vi.fn(async () => ({ ...current })),
    claim: vi.fn(async (_conversationId, _actionId, userId) => {
      if (current.status !== 'proposed') return null;
      current = {
        ...current,
        status: 'confirmed',
        resolvedBy: userId,
        resolvedAt: '2026-11-02T08:01:00.000Z',
      };
      writes.push('confirmed');
      return { ...current };
    }),
    reject: vi.fn(async (_conversationId, _actionId, userId) => {
      if (current.status !== 'proposed') return null;
      current = {
        ...current,
        status: 'rejected',
        resolvedBy: userId,
        resolvedAt: '2026-11-02T08:01:00.000Z',
      };
      writes.push('rejected');
      return { ...current };
    }),
    settle: vi.fn(async (_conversationId, _actionId, status, result) => {
      current = { ...current, status, result, resolvedAt: '2026-11-02T08:01:00.000Z' };
      writes.push(status);
      return { ...current };
    }),
    insertProposal: vi.fn(async () => ({ ...current })),
  };

  return { repo, writes, current: () => current };
}

function makeService(
  overrides: {
    repo?: ChatAgentActionRepository;
    tool?: ChatAgentTool | null;
    actions?: Partial<ChatAgentActionServiceDeps>;
  } = {}
) {
  const actions = overrides.repo ?? repository(proposal()).repo;
  const tool = overrides.tool ?? null;

  const service = new ChatAgentActionService({
    actions,
    agent: { insertAgentMessage: vi.fn(), allowance: vi.fn() } as unknown as ChatAgentRepository,
    chats: { getThread: vi.fn(async () => AGENT_THREAD) } as unknown as ChatService,
    resolveTool: () => tool,
    ...overrides.actions,
  });

  return { service, actions };
}

function writeTool(run: ChatAgentTool['run']): ChatAgentTool {
  return {
    name: 'record_expense',
    kind: 'write',
    description: 'مصروف',
    schema: z.strictObject({
      amount: z.number().positive(),
      category: z.string().min(1),
    }),
    run,
  };
}

describe('confirming a proposal (#818)', () => {
  it('runs the tool once and keeps the service’s answer on the row', async () => {
    const run = vi.fn(async () => ({ expense_id: 'expense-1' }));
    const { service } = makeService({ tool: writeTool(run) });

    const action = await service.confirm('user-1', 'conversation-1', 'action-1', CONTEXT);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      { amount: 5, category: 'قهوة' },
      expect.objectContaining({ userId: 'user-1', ip: '127.0.0.1' })
    );
    expect(action.status).toBe('applied');
    expect(action.result).toEqual({ result: { expense_id: 'expense-1' } });
    expect(action.resolvedBy).toBe('user-1');
  });

  it('applies once when confirmed twice, and the second answer says so', async () => {
    const run = vi.fn(async () => ({ expense_id: 'expense-1' }));
    const { service } = makeService({ tool: writeTool(run) });

    await service.confirm('user-1', 'conversation-1', 'action-1', CONTEXT);
    const second = await service
      .confirm('user-1', 'conversation-1', 'action-1', CONTEXT)
      .catch((caught: unknown) => caught);

    expect(run).toHaveBeenCalledTimes(1);
    expect(second).toBeInstanceOf(ChatAgentError);
    expect((second as ChatAgentError).status).toBe(409);
    expect((second as ChatAgentError).message).toBe('تمّت معالجة هذا الإجراء مسبقاً.');
  });

  it('refuses arguments outside the tool’s schema, and says why on the row', async () => {
    const run = vi.fn();
    const row = repository(proposal({ args: { amount: -5, category: 'قهوة' } }));
    const { service } = makeService({ repo: row.repo, tool: writeTool(run) });

    const action = await service.confirm('user-1', 'conversation-1', 'action-1', CONTEXT);

    expect(run).not.toHaveBeenCalled();
    expect(action.status).toBe('failed');
    expect(typeof action.result?.error).toBe('string');
  });

  it('draws a policy refusal as the reason, not as a fault', async () => {
    const run = vi.fn(async () => {
      throw new AppError('بلغت حدّ الخطة لهذا الشهر', 402, 'owned_item_cap');
    });
    const { service } = makeService({ tool: writeTool(run) });

    const action = await service.confirm('user-1', 'conversation-1', 'action-1', CONTEXT);

    expect(action.status).toBe('failed');
    expect(action.result?.error).toBe('بلغت حدّ الخطة لهذا الشهر');
  });

  it('translates the database’s own cap refusal into the member’s words', async () => {
    const run = vi.fn(async () => {
      throw new RepositoryError('blogpress.createPost', {
        code: 'PL001',
        message: 'the plan cap for community_drafts is reached',
      });
    });
    const { service } = makeService({ tool: writeTool(run) });

    const action = await service.confirm('user-1', 'conversation-1', 'action-1', CONTEXT);

    expect(action.status).toBe('failed');
    expect(action.result?.error).toBe('بلغت حدّ خطتك لهذا العنصر، ولا يمكن إضافة المزيد.');
  });

  it('declining resolves the row and never runs the tool', async () => {
    const run = vi.fn();
    const { service } = makeService({ tool: writeTool(run) });

    const action = await service.reject('user-1', 'conversation-1', 'action-1');

    expect(action.status).toBe('rejected');
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a proposal that is no longer open', async () => {
    const { repo } = repository(proposal({ status: 'applied' }));
    const { service } = makeService({ repo, tool: writeTool(vi.fn()) });

    const caught = await service
      .confirm('user-1', 'conversation-1', 'action-1', CONTEXT)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ChatAgentError);
    expect((caught as ChatAgentError).status).toBe(409);
  });
});
