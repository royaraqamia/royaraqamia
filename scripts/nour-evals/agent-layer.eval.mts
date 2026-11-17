import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type {
  AiChatClient,
  AiChatStreamEvent,
  AiChatTool,
  AiChatWireMessage,
} from '@/backend/clients/ai-chat';
import {
  ChatAgentService,
  type ChatAgentServiceDeps,
} from '@/backend/services/chat/chat-agent-service';
import { chatAgentTool } from '@/backend/services/chat/chat-agent-tools';
import type { ChatAgentTool } from '@/backend/services/chat/chat-agent-tools';
import type { ChatService } from '@/backend/services/chat/chat-service';
import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import type { SkillTelemetryRepository } from '@/backend/repositories/chat/skill-telemetry-repository';
import type { ChatAgentAllowance, ChatAgentEvent, ChatMessage } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import { deterministic, judge, writeJson } from './lib.mjs';

const here = resolve(process.cwd(), 'scripts/nour-evals');
const suite = JSON.parse(readFileSync(resolve(here, 'suite.json'), 'utf8')) as {
  agent: Array<{
    id: string;
    slice: string;
    topic: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    expect: { language: string; judge: string[]; mustExclude?: string[]; mustInclude?: string[] };
  }>;
};

const results: Array<Record<string, unknown>> = [];
let cfg: { key: string; base: string; model: string; judge: string };

beforeAll(() => {
  const key = process.env.OPENCODE_API_KEY?.trim() || process.env.AI_CHAT_API_KEY?.trim();
  if (!key) throw new Error('no key: export OPENCODE_API_KEY from the env file before vitest');
  cfg = {
    key,
    base: (process.env.AI_CHAT_BASE_URL || 'https://opencode.ai/inference/go/openai/v1').replace(
      /\/+$/,
      ''
    ),
    model: process.env.AI_CHAT_MODEL || 'deepseek-v4.1-flash',
    judge: 'claude-haiku-5-5',
  };
});

/** The exact production gateway, wrapped in the client interface the turn expects. */
function realClient(): AiChatClient {
  let sequence = 0;
  async function* stream(messages: AiChatWireMessage[], tools: AiChatTool[], signal: AbortSignal) {
    sequence += 1;
    const body: Record<string, unknown> = {
      model: cfg.model,
      stream: true,
      messages,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
    };
    const response = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.key}`,
        'content-type': 'application/json',
        'user-agent': 'royaraqamia-nour-evals-agent/1.0',
        'x-opencode-session': `eval-agent-${process.pid}-${sequence}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const raw = await response.text().catch(() => '');
    if (!response.ok) throw new Error(`gateway ${response.status}: ${raw.slice(0, 200)}`);

    const calls = new Map<number, { id?: string; name: string; arguments: string }>();
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let payload: {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = payload?.choices?.[0]?.delta;
      if (typeof delta?.content === 'string' && delta.content) {
        yield { type: 'text', text: delta.content } as AiChatStreamEvent;
      }
      for (const part of delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const prior = calls.get(index) ?? { name: '', arguments: '' };
        if (part.id) prior.id = part.id;
        if (part.function?.name) prior.name += part.function.name;
        if (part.function?.arguments) prior.arguments += part.function.arguments;
        calls.set(index, prior);
      }
    }
    for (const call of calls.values()) {
      yield {
        type: 'tool',
        call: { id: call.id ?? `call-${sequence}`, name: call.name, arguments: call.arguments },
      } as AiChatStreamEvent;
    }
  }

  return {
    model: cfg.model,
    async *streamReply(messages, signal) {
      for await (const event of stream(messages, [], signal)) {
        if (event.type === 'text') yield event.text;
      }
    },
    async reply(messages, signal) {
      let text = '';
      for await (const event of stream(messages, [], signal)) {
        if (event.type === 'text') text += event.text;
      }
      return text;
    },
    async *streamWithTools(messages, tools, signal) {
      yield* stream(messages, tools, signal);
    },
    async transcribe() {
      return null;
    },
  };
}

const allowance: ChatAgentAllowance = {
  plan: 'pro',
  member: { used: 3, cap: 40 },
  project: { used: 10, limit: 200 },
  resetsAt: '2026-11-18T00:00:00.000Z',
  apps: { used: 0, cap: 0, connected: 0 },
};

const thread = {
  id: 'eval-thread',
  kind: 'agent',
  status: 'active',
  title: 'نور',
  counterpart: null,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  lastMessageAt: null,
  createdAt: '2026-11-17T08:00:00.000Z',
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
};

function wireMessage(index: number, role: 'user' | 'assistant', body: string): ChatMessage {
  return {
    id: `eval-m-${index}`,
    conversationId: 'eval-thread',
    senderId: role === 'user' ? 'eval-user' : null,
    senderKind: role,
    body,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-11-17T08:00:00.000Z',
    clientId: null,
  } as ChatMessage;
}

const fakeSchema = z.object({}).passthrough();
const fakeTool = (name: string, tier: number, run: () => Promise<unknown>) =>
  ({
    name: name as ChatAgentTool['name'],
    kind: tier > 0 ? 'write' : 'read',
    product: 'certificates',
    tier,
    description: `eval tool ${name}`,
    schema: fakeSchema,
    run,
  }) as unknown as ChatAgentTool;

const tools: Record<string, ChatAgentTool> = {
  list_certificates: fakeTool('list_certificates', 0, async () => ({
    certificates: [
      { title: 'Certificate 1' },
      { title: 'Certificate 2' },
      { title: 'Certificate 3' },
    ],
  })),
  get_athkar: fakeTool('get_athkar', 0, async () => ({
    text: 'أذكار الصباح: سبحان الله وبحمده، سبحان الله العظيم.',
  })),
  get_verse: fakeTool('get_verse', 0, async () => ({
    text: 'آية الكرسي: الله لا إله إلا هو الحي القيوم.',
  })),
  remember: fakeTool('remember', 1, async () => ({ stored: true })),
  record_expense: fakeTool('record_expense', 1, async () => ({ ok: true })),
  search_web: fakeTool('search_web', 0, async () => ({ ok: true })),
};

function buildService(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const history = messages
    .slice(0, -1)
    .map((message, index) => wireMessage(index, message.role, message.content));
  const prior = history
    .filter((message) => message.senderKind === 'user')
    .map((message) => message.body);
  const agent = {
    allowance: vi.fn(async () => allowance),
    insertAgentMessage: vi.fn(async (_id: string, body: string) => ({
      ...wireMessage(99, 'assistant', body),
      id: 'eval-agent-message',
    })),
    startTurn: vi.fn(async () => 'eval-turn'),
    setTurnQuestion: vi.fn(async () => undefined),
    recordAttempt: vi.fn(async () => undefined),
    settleTurn: vi.fn(async () => undefined),
    failTurn: vi.fn(async () => undefined),
    dueTurns: vi.fn(async () => []),
    claimTurn: vi.fn(async () => null),
  } as unknown as ChatAgentRepository;

  const chats = {
    getThread: vi.fn(async () => thread),
    sendMessage: vi.fn(async () => wireMessage(history.length, 'user', prior.at(-1) ?? '')),
    listMessages: vi.fn(async () => ({ messages: history, nextCursor: null, actions: [] })),
  } as unknown as ChatService;

  const release = vi.fn(async () => undefined);
  const deps: ChatAgentServiceDeps = {
    agent,
    telemetry: {
      record: vi.fn(async () => undefined),
      outcomes: vi.fn(async () => []),
    } satisfies SkillTelemetryRepository,
    chats,
    attachments: { download: vi.fn(async () => new Uint8Array()) },
    reserve: vi.fn(async () => ({ eventId: 'eval-event', release })),
    reserveAppCall: vi.fn(async () => ({ eventId: 'eval-app-event', release })),
    usageState: vi.fn(async () => ({
      plan: 'pro' as const,
      unlimited: false,
      expiresAt: null,
      counters: [],
    })),
    client: realClient(),
    actions: {
      propose: vi.fn(async () => ({
        message: wireMessage(100, 'assistant', 'اقتراح'),
        action: {
          id: 'eval-action',
          conversationId: 'eval-thread',
          messageId: 'eval-action-message',
          tool: 'record_expense',
          args: {},
          status: 'proposed',
          result: null,
          createdAt: '2026-11-17T08:00:00.000Z',
          resolvedAt: null,
          resolvedBy: null,
        } satisfies ChatAgentAction,
      })),
    },
    search: {
      run: vi.fn(async () => ({
        sources: [
          {
            url: 'https://example.com/gold',
            title: 'Gold price today',
            domain: 'example.com',
            publishedDate: null,
          },
        ],
        evidence: '[1] سعر الذهب اليوم في Example: 100 دولار للأونصة.\n',
      })),
    },
    // Use the real registry for anything we did not explicitly fake, so web
    // search and the other reads behave as they do in production.
    resolveTool: (name: string) => tools[name] ?? chatAgentTool(name),
  };
  return new ChatAgentService(deps);
}

describe('نور agent-layer evals (real gateway, real turn assembly)', () => {
  for (const testCase of suite.agent) {
    it(
      testCase.id,
      async () => {
        const userMessage = testCase.messages.at(-1)?.content ?? '';
        const service = buildService(testCase.messages);
        const events: ChatAgentEvent[] = [];
        let error = '';
        let reply = '';
        try {
          for await (const event of service.turn('eval-user', 'eval-thread', userMessage, {
            supabase: {} as never,
            ip: '127.0.0.1',
          })) {
            events.push(event);
            if (event.type === 'delta') reply += event.text;
            if (event.type === 'done' && !reply) reply = event.message.body ?? '';
            if (event.type === 'error') error = event.error;
          }
        } catch (caught) {
          error = String(caught instanceof Error ? caught.message : caught).slice(0, 200);
        }

        const gate = deterministic(reply, testCase.expect);
        const observed = events
          .filter(
            (event) =>
              event.type === 'tool' ||
              event.type === 'proposal' ||
              event.type === 'sources' ||
              event.type === 'error'
          )
          .map((event) =>
            event.type === 'tool' ? `tool ${event.name} ok=${event.ok}` : event.type
          );
        const verdict = await judge(
          cfg,
          testCase.expect.judge,
          userMessage,
          reply,
          observed.length
            ? `Observed turn events: ${observed.join(', ')}. A successful read tool is a real data source, not an invention.`
            : ''
        );
        results.push({
          id: testCase.id,
          slice: testCase.slice,
          topic: testCase.topic,
          userMessage,
          reply,
          error,
          events: events.map((event) => event.type),
          deterministic: gate,
          judge: verdict,
        });
        expect(error).toBe('');
        expect(reply.length).toBeGreaterThan(0);
      },
      180_000
    );
  }
});

afterAll(async () => {
  await writeJson(resolve(here, 'eval-report-agent.json'), {
    generatedAt: new Date().toISOString(),
    meta: { tiers: ['agent'], model: cfg?.model, judge: cfg?.judge },
    tiers: [{ name: 'agent', cases: results }],
  });
});
