import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createSupabaseConversationSummaryReader,
  createSupabaseConversationSummaryWriter,
} from '@/backend/repositories/chat/conversation-summary-repository';

interface Result {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

/**
 * A PostgREST-shaped fake. The shape of the request is half of what this test is
 * about — a read that forgot `.is('deleted_at', null)` would summarise a
 * tombstone, and an update without the cursor predicate would let a stale
 * regeneration overwrite a newer summary.
 */
class Builder {
  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly next: () => Result
  ) {}

  private log(op: string): this {
    this.calls.push(`${this.table}:${op}`);
    return this;
  }

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    return this.log(
      `select ${String(columns)}${options?.head ? ' head' : ''}${
        options?.count ? ` count=${options.count}` : ''
      }`
    );
  }
  update(values: unknown) {
    return this.log(`update ${JSON.stringify(values)}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  gt(column: string, value: unknown) {
    return this.log(`gt ${column}=${String(value)}`);
  }
  order(column: string, options?: { ascending?: boolean }) {
    return this.log(`order ${column} ${options?.ascending === false ? 'desc' : 'asc'}`);
  }
  limit(count: number) {
    return this.log(`limit ${count}`);
  }
  maybeSingle() {
    this.log('maybeSingle');
    return Promise.resolve(this.next());
  }
  then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.next()).then(resolve, reject);
  }
}

function makeClient(results: Record<string, Result | Result[]> = {}) {
  const calls: string[] = [];
  const cursors: Record<string, number> = {};

  const from = (table: string) => {
    const entry = results[table];
    const next = (): Result => {
      if (Array.isArray(entry)) {
        const index = Math.min(cursors[table] ?? 0, entry.length - 1);
        cursors[table] = (cursors[table] ?? 0) + 1;
        return entry[index] ?? {};
      }
      return entry ?? {};
    };
    return new Builder(table, calls, next);
  };

  return { client: { from } as unknown as SupabaseClient, calls };
}

const SUMMARY_ROW = {
  summary: 'قرّرت العضو أن تبدأ الميزانية في 15 من كل شهر.',
  summary_through_message_id: 'message-3',
  summary_updated_at: '2026-11-15T09:00:00.000Z',
};

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-4',
    conversation_id: 'conversation-1',
    sender_id: 'user-1',
    sender_kind: 'user',
    body: 'رسالة',
    reply_to_id: null,
    edited_at: null,
    deleted_at: null,
    created_at: '2026-11-15T10:00:00.000Z',
    client_id: null,
    ...overrides,
  };
}

describe('the conversation summary repository', () => {
  it('reads the summary as the caller, so the conversation policy is the boundary', async () => {
    const { client, calls } = makeClient({
      chat_conversations: { data: SUMMARY_ROW, error: null },
    });
    const reader = createSupabaseConversationSummaryReader(client);

    expect(await reader.find('conversation-1')).toEqual({
      text: SUMMARY_ROW.summary,
      throughMessageId: 'message-3',
      updatedAt: SUMMARY_ROW.summary_updated_at,
    });
    expect(calls).toEqual([
      'chat_conversations:select summary, summary_through_message_id, summary_updated_at',
      'chat_conversations:eq id=conversation-1',
      'chat_conversations:maybeSingle',
    ]);
  });

  it('answers a conversation with no summary, or one with no text, with null', async () => {
    const empty = makeClient({
      chat_conversations: { data: { ...SUMMARY_ROW, summary: '   ' }, error: null },
    });
    expect(await createSupabaseConversationSummaryReader(empty.client).find('conversation-1')).toBe(
      null
    );

    const missing = makeClient({ chat_conversations: { data: null, error: null } });
    expect(
      await createSupabaseConversationSummaryReader(missing.client).find('conversation-1')
    ).toBeNull();
  });

  it('counts the live thread, and the live messages after the cursor', async () => {
    const { client, calls } = makeClient({
      chat_messages: [
        { count: 24, error: null },
        { data: { created_at: '2026-11-15T09:30:00.000Z' }, error: null },
        { count: 10, error: null },
      ],
    });
    const writer = createSupabaseConversationSummaryWriter(client);

    expect(await writer.progress('conversation-1', 'message-3')).toEqual({ total: 24, unseen: 10 });
    // A tombstone is not context: both counts and the read agree with the window.
    expect(calls).toEqual([
      'chat_messages:select id head count=exact',
      'chat_messages:eq conversation_id=conversation-1',
      'chat_messages:is deleted_at=null',
      'chat_messages:select created_at',
      'chat_messages:eq id=message-3',
      'chat_messages:maybeSingle',
      'chat_messages:select id head count=exact',
      'chat_messages:eq conversation_id=conversation-1',
      'chat_messages:is deleted_at=null',
      'chat_messages:gt created_at=2026-11-15T09:30:00.000Z',
    ]);
  });

  it('treats the whole thread as unseen when the cursor row is gone', async () => {
    const { client } = makeClient({
      chat_messages: [
        { count: 30, error: null },
        { data: null, error: null },
        { count: 30, error: null },
      ],
    });
    const writer = createSupabaseConversationSummaryWriter(client);

    expect(await writer.progress('conversation-1', 'message-gone')).toEqual({
      total: 30,
      unseen: 30,
    });
  });

  it('reads the unseen messages oldest first, capped, with tombstones and empty bodies dropped', async () => {
    const { client, calls } = makeClient({
      chat_messages: [
        { data: { created_at: '2026-11-15T09:30:00.000Z' }, error: null },
        {
          data: [
            messageRow({ id: 'message-4' }),
            messageRow({ id: 'message-5', sender_kind: 'agent', body: 'سنبدأ في 15.' }),
            messageRow({ id: 'message-6', deleted_at: '2026-11-15T10:05:00.000Z' }),
            messageRow({ id: 'message-7', body: '   ' }),
          ],
          error: null,
        },
      ],
    });
    const writer = createSupabaseConversationSummaryWriter(client);

    expect(await writer.unseen('conversation-1', 'message-3')).toEqual([
      {
        id: 'message-4',
        senderKind: 'user',
        body: 'رسالة',
        createdAt: '2026-11-15T10:00:00.000Z',
      },
      {
        id: 'message-5',
        senderKind: 'agent',
        body: 'سنبدأ في 15.',
        createdAt: '2026-11-15T10:00:00.000Z',
      },
    ]);
    expect(calls).toContain('chat_messages:order created_at asc');
    expect(calls).toContain('chat_messages:limit 200');
  });

  it('moves the cursor only if it is still the one the regeneration read from', async () => {
    const { client, calls } = makeClient({
      chat_conversations: { data: [{ id: 'conversation-1' }] },
    });
    const writer = createSupabaseConversationSummaryWriter(client);

    const saved = await writer.save({
      conversationId: 'conversation-1',
      text: 'ملخّص جديد',
      through: 'message-9',
      previous: 'message-3',
      at: '2026-11-15T10:00:00.000Z',
    });

    expect(saved).toBe(true);
    expect(calls).toContain('chat_conversations:eq summary_through_message_id=message-3');
    expect(calls).toContain('chat_conversations:select id');
  });

  it('writes the first summary only while no cursor exists', async () => {
    const { client, calls } = makeClient({
      chat_conversations: { data: [{ id: 'conversation-1' }] },
    });
    const writer = createSupabaseConversationSummaryWriter(client);

    await writer.save({
      conversationId: 'conversation-1',
      text: 'ملخّص أول',
      through: 'message-9',
      previous: null,
      at: '2026-11-15T10:00:00.000Z',
    });

    expect(calls).toContain('chat_conversations:is summary_through_message_id=null');
  });

  it('reports a lost swap as false rather than an error', async () => {
    const { client } = makeClient({ chat_conversations: { data: [], error: null } });
    const writer = createSupabaseConversationSummaryWriter(client);

    expect(
      await writer.save({
        conversationId: 'conversation-1',
        text: 'ملخّص قديم',
        through: 'message-9',
        previous: 'message-3',
        at: '2026-11-15T10:00:00.000Z',
      })
    ).toBe(false);
  });
});
