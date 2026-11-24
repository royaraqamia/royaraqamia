import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatAgentTool, type ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import { toolsDepsFor } from '@/backend/services/chat/__tests__/support/tools-deps';
import {
  createLinkHandler,
  deleteLinkHandler,
  getAnalyticsHandler,
  listLinksHandler,
  updateLinkHandler,
} from '@/backend/services/mcp/tools/linksnap';
import { CHAT_AGENT_TOOLS, chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';
import type { Note } from '@/shared/contracts/notes';

/**
 * The five hands each product gained in #1431.
 *
 * LinkSnap already has an MCP handler for every operation, and its
 * `structuredContent` is the domain value beside the markdown. The turn must
 * read that value rather than parse the rendering (ADR-0183's amendment) and
 * must never add the shortened-link check the service already owns. Notes has
 * no MCP door, so its tools go through NotesService and the same slot gate the
 * notes route applies.
 */

vi.mock('@/backend/services/mcp/tools/linksnap', () => ({
  listLinksHandler: vi.fn(),
  getAnalyticsHandler: vi.fn(),
  createLinkHandler: vi.fn(),
  updateLinkHandler: vi.fn(),
  deleteLinkHandler: vi.fn(),
}));

// Product-service fakes, handed to the catalogue through `ChatAgentToolsDeps`.
const createNotesService = vi.fn();
const createPlanGate = vi.fn();
const resolveOrigin = vi.fn(() => 'https://royaraqamia.com');

const deps = toolsDepsFor({
  notes: { createService: createNotesService },
  plans: { createPlanGate },
  origin: resolveOrigin,
});

function turnContext(): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1', deps };
}

function answer(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: '# markdown' }], structuredContent: value };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    clientId: '11111111-1111-4111-8111-111111111111',
    body: 'ملاحظة اليوم\nبقية النصّ.',
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const cap = vi.fn(async () => {});

function notesService(overrides: Record<string, unknown> = {}) {
  const service = {
    getSyncSnapshot: vi.fn(async () => ({ notes: [] as Note[], cursor: null })),
    getNote: vi.fn(async () => null as Note | null),
    saveNote: vi.fn(async () => {}),
    deleteNote: vi.fn(async () => {}),
    ...overrides,
  };
  vi.mocked(createNotesService).mockReturnValue(service as never);
  return service;
}

beforeEach(() => {
  vi.clearAllMocks();
  notesService();
  vi.mocked(createPlanGate).mockReturnValue({ cap } as never);
  vi.mocked(resolveOrigin).mockReturnValue('https://royaraqamia.com');
});

describe('the LinkSnap hands (#1431)', () => {
  it('reads the list handler’s structuredContent, never its markdown', async () => {
    const value = { links: [{ code: 'abc', originalUrl: 'https://example.com' }], total: 1 };
    vi.mocked(listLinksHandler).mockResolvedValue(answer(value));

    const result = await chatAgentTool('list_links')!.run({ limit: 5 }, turnContext());

    expect(result).toEqual(value);
    expect(vi.mocked(listLinksHandler).mock.calls[0]![0]).toEqual({
      page_size: 5,
      offset: 0,
      format: 'json',
    });
    const ctx = vi.mocked(listLinksHandler).mock.calls[0]![1];
    expect(ctx.userId).toBe('user-1');
    expect(ctx.scopes).toEqual(['linksnap.read']);
  });

  it('reads analytics for one owned code and answers a refusal in words', async () => {
    const value = { code: 'abc', totalClicks: 3 };
    vi.mocked(getAnalyticsHandler).mockResolvedValueOnce(answer(value));

    expect(
      await chatAgentTool('get_analytics')!.run({ code: 'abc', days: 30 }, turnContext())
    ).toEqual(value);
    expect(vi.mocked(getAnalyticsHandler).mock.calls[0]![0]).toEqual({
      code: 'abc',
      days: 30,
      format: 'json',
    });

    vi.mocked(getAnalyticsHandler).mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'No such link' }],
    });
    expect(await chatAgentTool('get_analytics')!.run({ code: 'nope' }, turnContext())).toEqual({
      error: 'لم أقرأ إحصاءات هذا الرابط.',
    });
  });

  it('proposes a create and returns the short URL once confirmed', async () => {
    const tool = chatAgentTool('create_link')!;
    expect(tool.tier).toBe(1);
    expect(chatAgentActionSentence('create_link', { url: 'https://example.com' })).toContain(
      'https://example.com'
    );

    vi.mocked(createLinkHandler).mockResolvedValue(
      answer({ code: 'abc', originalUrl: 'https://example.com', hasPassword: false })
    );
    const result = (await tool.run({ url: 'https://example.com' }, turnContext())) as {
      code: string;
      short_url: string;
    };

    expect(result.short_url).toBe('https://royaraqamia.com/abc');
    expect(vi.mocked(createLinkHandler).mock.calls[0]![0]).toEqual({
      url: 'https://example.com',
      format: 'json',
    });
    // The service owns the shortened-link check; the hand only forwards the URL.
    expect(vi.mocked(createLinkHandler).mock.calls[0]![1].scopes).toEqual(['linksnap.write']);
  });

  it('forwards an explicit null when a field is cleared, and a delete names its code', async () => {
    vi.mocked(updateLinkHandler).mockResolvedValue(answer({ code: 'abc', originalUrl: null }));
    await chatAgentTool('update_link')!.run(
      { code: 'abc', expires_at: null, password: null },
      turnContext()
    );
    expect(vi.mocked(updateLinkHandler).mock.calls[0]![0]).toMatchObject({
      expires_at: null,
      password: null,
    });

    const tool = chatAgentTool('delete_link')!;
    expect(tool.tier).toBe(3);
    expect(chatAgentActionSentence('delete_link', { code: 'abc' })).toContain('«abc»');
    vi.mocked(deleteLinkHandler).mockResolvedValue(answer({ code: 'abc', message: 'deleted' }));
    expect(await tool.run({ code: 'abc' }, turnContext())).toEqual({
      code: 'abc',
      message: 'deleted',
    });
  });
});

describe('the Notes hands (#1431)', () => {
  it('lists live note names and leaves tombstones out', async () => {
    const service = notesService({
      getSyncSnapshot: vi.fn(async () => ({
        notes: [
          note(),
          note({
            id: '22222222-2222-4222-8222-222222222222',
            body: 'ملاحظة محذوفة',
            deletedAt: '2026-11-16T09:00:00.000Z',
          }),
        ],
        cursor: null,
      })),
    });

    const result = (await chatAgentTool('list_notes')!.run({}, turnContext())) as {
      count: number;
      notes: Array<{ id: string; name: string }>;
    };

    expect(result.count).toBe(1);
    expect(result.notes).toEqual([
      { id: note().id, name: 'ملاحظة اليوم', updated_at: note().updatedAt },
    ]);
    expect(service.getSyncSnapshot).toHaveBeenCalledWith('user-1');
  });

  it('reads one note by id, and says so when it is gone', async () => {
    notesService({ getNote: vi.fn(async () => note()) });
    const found = (await chatAgentTool('get_note')!.run({ id: note().id }, turnContext())) as {
      found: boolean;
      body: string;
    };
    expect(found).toMatchObject({ found: true, body: note().body });

    notesService({ getNote: vi.fn(async () => null) });
    expect(await chatAgentTool('get_note')!.run({ id: note().id }, turnContext())).toEqual({
      found: false,
    });
  });

  it('checks the slot before a first save, then keeps the written body', async () => {
    const service = notesService();
    const result = (await chatAgentTool('create_note')!.run(
      { body: 'ملاحظة جديدة\nسطر ثانٍ' },
      turnContext()
    )) as { note_id: string; name: string };

    expect(cap).toHaveBeenCalledWith('user-1', 'notes');
    expect(service.saveNote).toHaveBeenCalledWith(
      'user-1',
      result.note_id,
      { body: 'ملاحظة جديدة\nسطر ثانٍ', deletedAt: null },
      { clientId: result.note_id }
    );
    expect(result.name).toBe('ملاحظة جديدة');
  });

  it('refuses to edit a note that is not there', async () => {
    const service = notesService();
    expect(
      await chatAgentTool('update_note')!.run({ id: note().id, body: 'نصّ جديد' }, turnContext())
    ).toEqual({ error: 'لم أجد هذه الملاحظة' });
    expect(service.saveNote).not.toHaveBeenCalled();
  });

  it('makes delete a tier-3 card that names the note and checks the target', async () => {
    const tool = chatAgentTool('delete_note')!;
    expect(tool.tier).toBe(3);
    expect(CHAT_AGENT_TOOLS.delete_note.kind).toBe('write');
    expect(chatAgentActionSentence('delete_note', { name: 'ملاحظة اليوم' })).toContain(
      '«ملاحظة اليوم»'
    );

    const service = notesService({ getNote: vi.fn(async () => note()) });
    expect(await tool.run({ id: note().id, name: 'اسم آخر' }, turnContext())).toEqual({
      error: 'اسم الملاحظة غير مطابق',
    });
    expect(service.deleteNote).not.toHaveBeenCalled();

    expect(await tool.run({ id: note().id, name: 'ملاحظة اليوم' }, turnContext())).toEqual({
      note_id: note().id,
      name: 'ملاحظة اليوم',
    });
    expect(service.deleteNote).toHaveBeenCalledWith('user-1', note().id);
  });

  it('keeps every hand strict about who is calling', () => {
    for (const name of [
      'list_links',
      'get_analytics',
      'create_link',
      'update_link',
      'delete_link',
      'list_notes',
      'get_note',
      'create_note',
      'update_note',
      'delete_note',
    ]) {
      const schema = chatAgentTool(name)!.schema;
      expect(schema.safeParse({ user_id: 'someone-else' }).success).toBe(false);
    }
  });
});
