import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseChatRepository } from '@/backend/repositories/chat/supabase-chat-repository';
import { RepositoryError } from '@/backend/shared/repository-error';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * Minimal PostgREST-shaped fake: it records the builder chain per table so the
 * assertions can name the write that happened, and answers a queue of results
 * per table so one test can script "the insert collides, then the lookup finds
 * the row that collision was made by".
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

  insert(row: unknown) {
    return this.log(`insert ${JSON.stringify(row)}`);
  }
  select() {
    return this.log('select');
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  single() {
    this.log('single');
    return Promise.resolve(this.next());
  }
  maybeSingle() {
    this.log('maybeSingle');
    return Promise.resolve(this.next());
  }
}

function makeClient(results: Record<string, Result | Result[]> = {}) {
  const calls: string[] = [];
  const cursors: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    const entry = results[table];
    const next = (): Result => {
      if (Array.isArray(entry)) {
        const index = Math.min(cursors[table] ?? 0, entry.length - 1);
        cursors[table] = (cursors[table] ?? 0) + 1;
        return entry[index]!;
      }
      return entry ?? { data: null, error: null };
    };
    return new Builder(table, calls, next);
  });

  return { client: { from } as unknown as SupabaseClient, calls, from };
}

const clientId = '11111111-1111-7111-8111-111111111111';

const messageRow = {
  id: 'm-1',
  conversation_id: 'c-1',
  sender_id: 'u-1',
  sender_kind: 'user',
  body: 'مرحبا',
  reply_to_id: null,
  edited_at: null,
  deleted_at: null,
  created_at: '2026-11-01T10:05:00.000Z',
  client_id: clientId,
};

describe('SupabaseChatRepository.insertMessage — offline write contract (#1033)', () => {
  it("writes the writer's own id for the line and answers it back", async () => {
    const { client, calls } = makeClient({ chat_messages: { data: messageRow, error: null } });
    const repository = createSupabaseChatRepository(client);

    const result = await repository.insertMessage({
      conversationId: 'c-1',
      senderId: 'u-1',
      senderKind: 'user',
      body: 'مرحبا',
      clientId,
    });

    expect(calls[0]).toContain(`"client_id":"${clientId}"`);
    expect(result.record).toMatchObject({ id: 'm-1', clientId, body: 'مرحبا' });
    expect(result.attachmentFailure).toBeNull();
  });

  it('answers the row the first attempt wrote when a replay collides with it', async () => {
    const { client, calls } = makeClient({
      chat_messages: [
        { data: null, error: { code: '23505', message: 'duplicate key value' } },
        { data: messageRow, error: null },
      ],
    });
    const repository = createSupabaseChatRepository(client);

    const result = await repository.insertMessage({
      conversationId: 'c-1',
      senderId: 'u-1',
      senderKind: 'user',
      body: null,
      clientId,
      // The first attempt already wrote these rows: a replay must not add a
      // second copy of the attachment, nor of the message.
      attachments: [
        {
          storagePath: 'c-1/u-1/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          byteSize: 2048,
        },
      ],
    });

    expect(result.record).toMatchObject({ id: 'm-1', clientId });
    expect(result.attachmentFailure).toBeNull();
    expect(calls.some((call) => call.startsWith('chat_attachments:insert'))).toBe(false);
    expect(calls).toContain('chat_messages:eq sender_id=u-1');
    expect(calls).toContain(`chat_messages:eq client_id=${clientId}`);
  });

  it('still treats a collision without a client id as an outage', async () => {
    const { client, calls } = makeClient({
      chat_messages: { data: null, error: { code: '23505', message: 'duplicate key value' } },
    });
    const repository = createSupabaseChatRepository(client);

    await expect(
      repository.insertMessage({
        conversationId: 'c-1',
        senderId: 'u-1',
        senderKind: 'user',
        body: 'مرحبا',
      })
    ).rejects.toBeInstanceOf(RepositoryError);

    // Nothing to reconcile without a client-minted id, so no lookup is made.
    expect(calls.some((call) => call.startsWith('chat_messages:eq'))).toBe(false);
  });
});
