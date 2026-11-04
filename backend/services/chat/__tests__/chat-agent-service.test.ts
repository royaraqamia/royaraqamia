import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  AiChatProviderError,
  type AiChatClient,
  type AiChatStreamEvent,
  type AiChatWireMessage,
} from '@/backend/clients/ai-chat';
import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import {
  ChatAgentError,
  ChatAgentService,
  allowanceSpentSentence,
  trimHistory,
  type ChatAgentServiceDeps,
} from '@/backend/services/chat/chat-agent-service';
import type { ChatAgentTool } from '@/backend/services/chat/chat-agent-tools';
import type { ChatService } from '@/backend/services/chat/chat-service';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
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

/** What a turn's tools need from the request; none of it comes from the model. */
const TURN_CONTEXT = { supabase: {} as never, ip: '127.0.0.1' };

const PROPOSAL: ChatAgentAction = {
  id: 'action-1',
  conversationId: 'conversation-1',
  messageId: 'message-p',
  tool: 'record_expense',
  args: { amount: 5 },
  status: 'proposed',
  result: null,
  createdAt: '2026-11-02T08:01:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
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

/** A client that answers each round from a script, and remembers what it read. */
function scriptedClient(rounds: AiChatStreamEvent[][]): AiChatClient & {
  calls: AiChatWireMessage[][];
} {
  const calls: AiChatWireMessage[][] = [];

  return {
    model: 'gemini-3.8-flash',
    calls,

    async *streamReply() {},
    transcribe: async () => null,
    async *streamWithTools(messages) {
      calls.push(messages);
      const round = rounds[calls.length - 1] ?? [];
      for (const event of round) yield event;
    },
  };
}

function textStream(...parts: string[]): AiChatStreamEvent[] {
  return parts.map((text) => ({ type: 'text' as const, text }));
}

function toolCall(name: string, args: Record<string, unknown>, id = 'call-1'): AiChatStreamEvent {
  return { type: 'tool', call: { id, name, arguments: JSON.stringify(args) } };
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
    startTurn: vi.fn(async () => 'turn-1'),
    setTurnQuestion: vi.fn(async () => undefined),
    recordAttempt: vi.fn(async () => undefined),
    settleTurn: vi.fn(async () => undefined),
    failTurn: vi.fn(async () => undefined),
    dueTurns: vi.fn(async () => []),
    claimTurn: vi.fn(async () => null),
  } satisfies ChatAgentRepository;

  const chats = {
    getThread: vi.fn(async () => AGENT_THREAD),
    sendMessage: vi.fn(async () => message('message-1', 'user', 'سؤالي')),
    listMessages: vi.fn(async () => ({
      messages: [message('message-1', 'user', 'سؤالي')],
      nextCursor: null,
      actions: [],
    })),
  } as unknown as ChatService;

  const release = vi.fn(async () => undefined);
  const reserve = vi.fn(async () => ({ eventId: 'event-1', release }));
  const attachments = { download: vi.fn(async () => new Uint8Array([1, 2, 3])) };

  const actions = {
    propose: vi.fn(async () => ({
      message: message('message-p', 'agent', 'اقتراح'),
      action: PROPOSAL,
    })),
  };

  const service = new ChatAgentService({
    agent,
    chats,
    attachments,
    reserve,
    client: scriptedClient([textStream('مرحبا ', 'بك')]),
    actions,
    ...overrides,
  });

  return { service, agent, chats, reserve, release, actions, attachments };
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

    const events = await collect(service.turn('user-1', 'conversation-1', 'سؤالي', TURN_CONTEXT));

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

    await expect(
      collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT))
    ).rejects.toMatchObject({ status: 503 });
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
      attachments: { download: vi.fn(async () => new Uint8Array()) },
      reserve,
      client: scriptedClient([textStream('x')]),
      actions: { propose: vi.fn() },
    });

    await expect(
      collect(free.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT))
    ).rejects.toMatchObject({
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

    const error = await collect(
      service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT)
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChatAgentError);
    expect((error as ChatAgentError).status).toBe(402);
    expect((error as ChatAgentError).message).toBe(allowanceSpentSentence(PRO_ALLOWANCE.resetsAt));
  });

  it('gives the count back when the provider produced no answer', async () => {
    const { service, release } = makeService({
      client: {
        model: 'deepseek-v4.1-flash',

        async *streamReply() {},
        transcribe: async () => null,
        // eslint-disable-next-line require-yield -- the failure is the point of this fixture
        async *streamWithTools() {
          throw new Error('socket closed');
        },
      },
    });

    await expect(
      collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT))
    ).rejects.toMatchObject({ status: 502 });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit once when nothing has streamed yet, and answers', async () => {
    let attempts = 0;
    const { service, agent, release } = makeService({
      client: {
        model: 'deepseek-v4.1-flash',
        async *streamReply() {},
        transcribe: async () => null,
        async *streamWithTools() {
          attempts += 1;
          if (attempts === 1) throw new AiChatProviderError(429);
          yield { type: 'text' as const, text: 'تم.' };
        },
      },
    });

    const events = await collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT));

    expect(attempts).toBe(2);
    expect(agent.recordAttempt).toHaveBeenCalledWith('turn-1', 1);
    expect(agent.settleTurn).toHaveBeenCalledWith('turn-1');
    expect(agent.insertAgentMessage).toHaveBeenCalledWith('conversation-1', 'تم.');
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(release).not.toHaveBeenCalled();
  });

  it('does not retry once text has streamed, and keeps what was written', async () => {
    const client: AiChatClient = {
      model: 'deepseek-v4.1-flash',
      async *streamReply() {},
      transcribe: async () => null,
      async *streamWithTools() {
        yield { type: 'text' as const, text: 'بدأت أشرح' };
        throw new AiChatProviderError(500);
      },
    };

    const { service, agent, release } = makeService({ client });

    await expect(
      collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT))
    ).rejects.toMatchObject({ status: 502 });

    // One call: repeating it would show the member the same paragraph twice.
    expect(agent.recordAttempt).not.toHaveBeenCalled();
    expect(agent.failTurn).toHaveBeenCalledWith('turn-1', {
      error: expect.any(String),
      partialText: 'بدأت أشرح',
    });
    expect(agent.settleTurn).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('answers a voice note with its transcript, and keeps the recording attached', async () => {
    const transcribe = vi.fn(async () => 'اشتريت قهوة');
    const { service, chats, agent, attachments } = makeService({
      client: {
        model: 'deepseek-v4.1-flash',
        async *streamReply() {},
        transcribe,
        async *streamWithTools() {
          yield { type: 'text' as const, text: 'تم.' };
        },
      },
    });

    const voice = {
      storagePath: 'conversation-1/voice/note.wav',
      fileName: 'note.wav',
      mimeType: 'audio/wav',
      byteSize: 12,
    };

    await collect(service.turn('user-1', 'conversation-1', '', TURN_CONTEXT, [voice]));

    expect(attachments.download).toHaveBeenCalledWith('conversation-1/voice/note.wav');
    expect(transcribe).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/wav');
    // The recording stays in the thread, and the words are what the message says.
    expect(chats.sendMessage).toHaveBeenCalledWith('user-1', 'conversation-1', {
      body: 'اشتريت قهوة',
      attachments: [voice],
    });
    expect(agent.setTurnQuestion).toHaveBeenCalledWith('turn-1', 'اشتريت قهوة');
  });

  it('answers a note it could not transcribe with a sentence, and gives the count back', async () => {
    const { service, chats, release } = makeService({
      client: {
        model: 'deepseek-v4.1-flash',
        async *streamReply() {},
        transcribe: async () => null,
        async *streamWithTools() {
          yield { type: 'text' as const, text: 'unreachable' };
        },
      },
    });

    await expect(
      collect(
        service.turn('user-1', 'conversation-1', '', TURN_CONTEXT, [
          {
            storagePath: 'conversation-1/voice/note.wav',
            fileName: 'note.wav',
            mimeType: 'audio/wav',
            byteSize: 12,
          },
        ])
      )
    ).rejects.toMatchObject({ status: 422 });

    expect(chats.sendMessage).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('hands an image to the model as an image part', async () => {
    const client = scriptedClient([textStream('أرى صورة.')]);
    const { service, chats, attachments } = makeService({ client });

    await collect(
      service.turn('user-1', 'conversation-1', '', TURN_CONTEXT, [
        {
          storagePath: 'conversation-1/img/a.png',
          fileName: 'a.png',
          mimeType: 'image/png',
          byteSize: 3,
        },
      ])
    );

    expect(attachments.download).toHaveBeenCalledWith('conversation-1/img/a.png');
    // The image travels as a part, not as an empty body the model cannot see.
    expect(client.calls[0]?.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }],
    });
    expect(chats.sendMessage).toHaveBeenCalledWith('user-1', 'conversation-1', {
      body: '',
      attachments: [expect.objectContaining({ fileName: 'a.png' })],
    });
  });

  it('hands a text file to the model as its words', async () => {
    const client = scriptedClient([textStream('قرأت الملف.')]);
    const download = vi.fn(async () => new TextEncoder().encode('مرحبا'));
    const { service } = makeService({ client, attachments: { download } });

    await collect(
      service.turn('user-1', 'conversation-1', '', TURN_CONTEXT, [
        {
          storagePath: 'conversation-1/text/notes.txt',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          byteSize: 10,
        },
      ])
    );

    expect(download).toHaveBeenCalledWith('conversation-1/text/notes.txt');
    expect(client.calls[0]?.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'text', text: '[notes.txt]\nمرحبا' }],
    });
  });

  it('refuses a file no model can read with a sentence, and gives the count back', async () => {
    const { service, chats, release } = makeService();

    await expect(
      collect(
        service.turn('user-1', 'conversation-1', '', TURN_CONTEXT, [
          {
            storagePath: 'conversation-1/docs/report.pdf',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            byteSize: 40,
          },
        ])
      )
    ).rejects.toMatchObject({
      status: 422,
      message: 'لا أستطيع قراءة هذا النوع من الملفات. أرسل صورة أو ملفاً نصياً أو رسالة صوتية.',
    });

    expect(chats.sendMessage).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('settles the turn row when the answer lands', async () => {
    const { service, agent } = makeService();

    await collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT));

    expect(agent.startTurn).toHaveBeenCalledWith('conversation-1', 'user-1', 'سؤال');
    expect(agent.settleTurn).toHaveBeenCalledWith('turn-1');
    expect(agent.failTurn).not.toHaveBeenCalled();
  });

  it('resumes a turn without writing the question again or taking a second count', async () => {
    const { service, agent, chats, reserve, release } = makeService();

    const events = await collect(
      service.resume(
        {
          id: 'turn-1',
          conversationId: 'conversation-1',
          memberId: 'user-1',
          question: 'سؤال',
          resumes: 1,
        },
        TURN_CONTEXT
      )
    );

    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(chats.sendMessage).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(agent.startTurn).not.toHaveBeenCalled();
    expect(agent.settleTurn).toHaveBeenCalledWith('turn-1');
    expect(release).not.toHaveBeenCalled();
  });

  it('answers even when the turn record cannot be opened, and spends nothing extra', async () => {
    // The window between the deploy and the migration: the table does not exist.
    const { service, agent, release } = makeService({
      agent: {
        ...makeService().agent,
        startTurn: vi.fn(async () => {
          throw new Error('relation "agent_turns" does not exist');
        }),
      },
    });

    const events = await collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT));

    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(agent.settleTurn).not.toHaveBeenCalled();
    expect(agent.failTurn).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
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

    await expect(
      collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT))
    ).rejects.toMatchObject({ status: 402 });
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

    await expect(
      collect(service.turn('user-1', 'conversation-1', 'سؤال', TURN_CONTEXT))
    ).rejects.toMatchObject({
      status: 402,
      message: allowanceSpentSentence(PRO_ALLOWANCE.resetsAt),
    });
  });
});

describe('the assistant’s tools (#818)', () => {
  // A real Zod schema keeps the validation path honest without a provider.
  const readTool: ChatAgentTool = {
    name: 'list_certificates',
    kind: 'read',
    description: 'شهاداتك',
    schema: z.strictObject({}),
    run: vi.fn(async () => [{ id: 'cert-1', course_name: 'دورة' }]),
  };

  it('runs a read tool and hands its answer back to the model in the same turn', async () => {
    const client = scriptedClient([
      [toolCall('list_certificates', {})],
      textStream('عندك شهادة واحدة.'),
    ]);

    const { service, agent } = makeService({
      client,
      resolveTool: (name) => (name === 'list_certificates' ? readTool : null),
    });

    const events = await collect(
      service.turn('user-1', 'conversation-1', 'شهاداتي؟', TURN_CONTEXT)
    );

    expect(events).toContainEqual({
      type: 'tool',
      name: 'list_certificates',
      label: 'قراءة شهاداتك',
    });
    expect(readTool.run).toHaveBeenCalledWith({}, expect.objectContaining({ userId: 'user-1' }));

    // The model's second round reads the tool's answer as a tool message.
    const second = client.calls[1] ?? [];
    expect(second).toContainEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: JSON.stringify([{ id: 'cert-1', course_name: 'دورة' }]),
    });
    expect(agent.insertAgentMessage).toHaveBeenCalledWith('conversation-1', 'عندك شهادة واحدة.');
  });

  it('proposes a write and never runs it during the turn', async () => {
    const writeTool: ChatAgentTool = {
      name: 'record_expense',
      kind: 'write',
      description: 'مصروف',
      schema: z.strictObject({ amount: z.number() }),
      run: vi.fn(async () => ({ expense_id: 'expense-1' })),
    };

    const client = scriptedClient([
      [toolCall('record_expense', { amount: 5 })],
      textStream('جاهز للتأكيد.'),
    ]);

    const { service, actions } = makeService({
      client,
      resolveTool: (name) => (name === 'record_expense' ? writeTool : null),
    });

    const events = await collect(
      service.turn('user-1', 'conversation-1', 'سجّل مصروفاً', TURN_CONTEXT)
    );

    expect(actions.propose).toHaveBeenCalledWith('conversation-1', 'record_expense', { amount: 5 });
    expect(writeTool.run).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === 'proposal')).toBe(true);
  });

  it('stops after three tool rounds and answers with what it has', async () => {
    const client = scriptedClient([]);
    // Every round asks again; the script is spied so the call count is the point.
    const asking = {
      ...client,
      async *streamWithTools(messages: AiChatWireMessage[]) {
        client.calls.push(messages);
        yield toolCall('list_certificates', {}, `call-${client.calls.length}`);
      },
    } as AiChatClient;

    const { service, agent } = makeService({
      client: asking,
      resolveTool: () => readTool,
    });

    await collect(service.turn('user-1', 'conversation-1', 'شهاداتي؟', TURN_CONTEXT));

    expect(client.calls).toHaveLength(4);
    expect(agent.insertAgentMessage).toHaveBeenCalledWith(
      'conversation-1',
      'لم أستطع إكمال ما طلبته الآن. أعد صياغة الطلب أو أكمل ما تريده بنفسك.'
    );
  });
});
