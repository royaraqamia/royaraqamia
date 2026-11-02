import { describe, expect, it, vi } from 'vitest';

import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import {
  ChatAgentError,
  ChatAgentService,
  allowanceSpentSentence,
  trimHistory,
  type ChatAgentServiceDeps,
} from '@/backend/services/chat/chat-agent-service';
import type { ChatService } from '@/backend/services/chat/chat-service';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';
import type { ChatAgentAllowance, ChatAgentEvent, ChatMessage } from '@/shared/contracts/chat';

const AGENT_THREAD = {
  id: 'conversation-1',
  kind: 'agent',
  status: 'active',
  title: 'المساعد الذكي',
  counterpart: null,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  lastMessageAt: null,
  createdAt: '2026-11-02T08:00:00.000Z',
  participants: [],
  me: null,
  blockedByMe: false,
  canWrite: true,
  attachmentQuota: {
    fileBytes: 1,
    today: { usedBytes: 0, limitBytes: 1 },
    total: { usedBytes: 0, limitBytes: 1 },
    project: { usedBytes: 0, limitBytes: 1 },
  },
} as unknown as Awaited<ReturnType<ChatService['getThread']>>;

const PRO_ALLOWANCE: ChatAgentAllowance = {
  plan: 'pro',
  member: { used: 3, cap: 40 },
  project: { used: 10, limit: 200 },
  resetsAt: '2026-11-03T00:00:00.000Z',
};

function message(id: string, senderKind: ChatMessage['senderKind'], body: string): ChatMessage {
  return {
    id,
    conversationId: 'conversation-1',
    senderId: senderKind === 'user' ? 'user-1' : null,
    senderKind,
    body,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-11-02T08:00:00.000Z',
    attachments: [],
    replyTo: null,
  };
}

function makeService(overrides: Partial<ChatAgentServiceDeps> = {}) {
  const agent = {
    allowance: vi.fn(async () => PRO_ALLOWANCE),
    insertAgentMessage: vi.fn(async (conversationId: string, body: string) => ({
      id: 'message-2',
      conversationId,
      senderId: null,
      senderKind: 'agent' as const,
      body,
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: '2026-11-02T08:01:00.000Z',
    })),
  } satisfies ChatAgentRepository;

  const chats = {
    getThread: vi.fn(async () => AGENT_THREAD),
    sendMessage: vi.fn(async () => message('message-1', 'user', 'سؤالي')),
    listMessages: vi.fn(async () => ({
      messages: [message('message-1', 'user', 'سؤالي')],
      nextCursor: null,
    })),
  } as unknown as ChatService;

  const release = vi.fn(async () => undefined);
  const reserve = vi.fn(async () => ({ eventId: 'event-1', release }));

  const client = {
    model: 'gemini-3.8-flash',
    async *streamReply() {
      yield 'مرحبا ';
      yield 'بك';
    },
  };

  const service = new ChatAgentService({
    agent,
    chats,
    reserve,
    client,
    ...overrides,
  });

  return { service, agent, chats, reserve, release };
}

async function collect(events: AsyncGenerator<ChatAgentEvent>) {
  const received: ChatAgentEvent[] = [];
  for await (const event of events) received.push(event);
  return received;
}

describe('trimHistory', () => {
  it('keeps the newest twenty lines, tombstones dropped', () => {
    const messages = Array.from({ length: 25 }, (_, index) =>
      message(`m${index}`, index % 2 === 0 ? 'user' : 'agent', `line ${index}`)
    );
    const deleted = { ...message('gone', 'user', 'gone'), deletedAt: '2026-11-02T08:00:00.000Z' };

    const trimmed = trimHistory([...messages, deleted]);

    expect(trimmed).toHaveLength(20);
    expect(trimmed[trimmed.length - 1]?.content).toBe('line 24');
    expect(trimmed.some((entry) => entry.content === 'gone')).toBe(false);
  });

  it('drops the oldest lines until the token budget fits, never the question', () => {
    const long = 'ا'.repeat(4_000);
    const messages = [message('a', 'user', long), message('b', 'user', 'قصير')];

    const trimmed = trimHistory(messages, 20, 100);

    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]?.content).toBe('قصير');
  });

  it('names the assistant’s lines as assistant turns', () => {
    const trimmed = trimHistory([message('a', 'user', 'سؤال'), message('b', 'agent', 'جواب')]);

    expect(trimmed.map((entry) => entry.role)).toEqual(['user', 'assistant']);
  });
});

describe('the assistant turn', () => {
  it('streams the answer and stores it as the agent’s own row', async () => {
    const { service, chats, agent, reserve } = makeService();

    const events = await collect(service.turn('user-1', 'conversation-1', 'سؤالي'));

    expect(events[0]).toEqual({ type: 'delta', text: 'مرحبا ' });
    expect(events[1]).toEqual({ type: 'delta', text: 'بك' });
    expect(events[2]).toMatchObject({
      type: 'done',
      message: { senderKind: 'agent', senderId: null },
    });

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(chats.sendMessage).toHaveBeenCalledWith('user-1', 'conversation-1', { body: 'سؤالي' });
    expect(agent.insertAgentMessage).toHaveBeenCalledWith('conversation-1', 'مرحبا بك');
  });

  it('is unavailable when no provider key is configured', async () => {
    const { service } = makeService({ client: null });

    await expect(collect(service.turn('user-1', 'conversation-1', 'سؤال'))).rejects.toMatchObject({
      status: 503,
    });
  });

  it('locks the assistant for a Free member without writing anything', async () => {
    const { chats, reserve } = makeService();
    const free = new ChatAgentService({
      agent: {
        allowance: vi.fn(async () => ({
          ...PRO_ALLOWANCE,
          plan: 'free' as const,
          member: { used: 0, cap: 0 },
        })),
        insertAgentMessage: vi.fn(),
      } as unknown as ChatAgentRepository,
      chats,
      reserve,
      client: {
        model: 'gemini-3.8-flash',
        async *streamReply() {
          yield 'x';
        },
      },
    });

    await expect(collect(free.turn('user-1', 'conversation-1', 'سؤال'))).rejects.toMatchObject({
      status: 402,
      message: 'المساعد متاح لمشتركي الخطة المدفوعة.',
    });
    expect(reserve).not.toHaveBeenCalled();
  });

  it('refuses the turn whose day is spent, naming the reset', async () => {
    const { service } = makeService({
      agent: {
        allowance: vi.fn(async () => ({ ...PRO_ALLOWANCE, member: { used: 40, cap: 40 } })),
        insertAgentMessage: vi.fn(),
      } as unknown as ChatAgentRepository,
    });

    const error = await collect(service.turn('user-1', 'conversation-1', 'سؤال')).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(ChatAgentError);
    expect((error as ChatAgentError).status).toBe(402);
    expect((error as ChatAgentError).message).toBe(allowanceSpentSentence(PRO_ALLOWANCE.resetsAt));
  });

  it('gives the count back when the provider produced no answer', async () => {
    const { service, release } = makeService({
      client: {
        model: 'gemini-3.8-flash',
        // eslint-disable-next-line require-yield -- the failure is the point of this fixture
        async *streamReply() {
          throw new Error('socket closed');
        },
      },
    });

    await expect(collect(service.turn('user-1', 'conversation-1', 'سؤال'))).rejects.toMatchObject({
      status: 502,
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('gives the count back when the ledger refuses the project ceiling', async () => {
    const { service, chats } = makeService({
      reserve: vi.fn(async () => {
        const refusal = Object.assign(new Error('chat agent project daily allowance reached'), {
          code: '53400',
        });
        throw refusal;
      }),
    });

    await expect(collect(service.turn('user-1', 'conversation-1', 'سؤال'))).rejects.toMatchObject({
      status: 402,
    });
    expect(chats.sendMessage).not.toHaveBeenCalled();
  });

  it('answers the ledger’s own counter refusal with the allowance sentence', async () => {
    const { service } = makeService({
      reserve: vi.fn(async () => {
        throw new UsageLimitReachedError(
          {
            key: 'chat.agent.turn',
            label: 'سؤال للمساعد الذكي',
            window: 'daily',
            cap: 40,
            used: 40,
            remaining: 0,
          },
          false
        );
      }),
    });

    await expect(collect(service.turn('user-1', 'conversation-1', 'سؤال'))).rejects.toMatchObject({
      status: 402,
      message: allowanceSpentSentence(PRO_ALLOWANCE.resetsAt),
    });
  });
});
