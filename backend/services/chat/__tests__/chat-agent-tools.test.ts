import { describe, expect, it, vi } from 'vitest';

import {
  chatAgentTool,
  chatAgentToolDefinitions,
  chatAgentToolDefinitionsForTurn,
  chatAgentTools,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import type { ScreenContext } from '@/shared/contracts/screen-context';
import { URL_EXTRACT_UNAVAILABLE, WEB_SEARCH_UNAVAILABLE } from '@/shared/contracts/web-search';
import {
  ADMIN_AGENT_TOOL_NAMES,
  CHAT_AGENT_TOOLS,
  CHAT_AGENT_TOOL_NAMES,
  chatAgentActionSentence,
} from '@/shared/contracts/chat-agent-actions';

const SCREEN: ScreenContext = {
  route: '/notes',
  product: 'notes',
  screenId: 'notes',
  title: 'الملاحظات',
  overlays: [],
  focus: null,
  tab: null,
  fields: {},
  text: '',
  updatedAt: '2026-11-15T09:00:00.000Z',
};

/** What a tool needs from the turn it runs in; no database in this file. */
function turnContext(overrides: Partial<ChatAgentToolContext> = {}): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1', ...overrides };
}

describe('the assistant’s tool registry (#818)', () => {
  it('declares every named tool exactly once, with the kind the contract says', () => {
    expect(
      chatAgentTools()
        .map((tool) => tool.name)
        .sort()
    ).toEqual([...CHAT_AGENT_TOOL_NAMES].sort());

    for (const tool of chatAgentTools()) {
      expect(tool.kind).toBe(CHAT_AGENT_TOOLS[tool.name].kind);
    }
  });

  it('refuses an argument object that tries to name another member', () => {
    const tool = chatAgentTool('record_expense');
    expect(tool).not.toBeNull();

    const parsed = tool!.schema.safeParse({
      amount: 5,
      category: 'قهوة',
      user_id: 'someone-else',
    });

    // Strict objects are the structural half of "the member is the caller".
    expect(parsed.success).toBe(false);
  });

  it('accepts the same arguments without a member id', () => {
    const parsed = chatAgentTool('record_expense')!.schema.safeParse({
      amount: 5,
      category: 'قهوة',
    });
    expect(parsed.success).toBe(true);
  });

  it('sends every tool as an OpenAI-compatible function with a JSON schema', () => {
    const definitions = chatAgentToolDefinitions();

    expect(definitions).toHaveLength(CHAT_AGENT_TOOL_NAMES.length);
    for (const definition of definitions) {
      expect(definition.type).toBe('function');
      expect(definition.function.name).toBeTruthy();
      expect(definition.function.description).toBeTruthy();
      expect(definition.function.parameters).toMatchObject({ type: 'object' });
    }
  });

  it('declares the screen refresh only when the request brought eyes', () => {
    const names = (input: { hasApps: boolean; hasScreen: boolean }) =>
      chatAgentToolDefinitionsForTurn({
        ...input,
        hasWebSearch: false,
        hasUrlExtract: false,
        isAdmin: false,
      }).map((definition) => definition.function.name);

    expect(names({ hasApps: false, hasScreen: false })).not.toContain('get_screen_context');
    expect(names({ hasApps: false, hasScreen: true })).toContain('get_screen_context');
    // A connected app does not make a screen exist.
    expect(names({ hasApps: true, hasScreen: false })).not.toContain('get_screen_context');
  });

  it('declares no admin capability to a member’s turn', () => {
    const names = chatAgentToolDefinitionsForTurn({
      hasApps: false,
      hasScreen: false,
      hasWebSearch: false,
      hasUrlExtract: false,
      isAdmin: false,
    }).map((definition) => definition.function.name);

    for (const adminName of ADMIN_AGENT_TOOL_NAMES) {
      expect(names).not.toContain(adminName);
    }

    const adminNames = chatAgentToolDefinitionsForTurn({
      hasApps: false,
      hasScreen: false,
      hasWebSearch: false,
      hasUrlExtract: false,
      isAdmin: true,
    }).map((definition) => definition.function.name);

    for (const adminName of ADMIN_AGENT_TOOL_NAMES) {
      expect(adminNames).toContain(adminName);
    }
  });

  it('re-reads the snapshot of the turn that called it, never an older one', async () => {
    const tool = chatAgentTool('get_screen_context')!;
    const older = { ...SCREEN, route: '/notes/draft', updatedAt: '2026-11-15T08:00:00.000Z' };
    const newer = { ...SCREEN, route: '/notes', updatedAt: '2026-11-15T09:00:00.000Z' };
    const answerFor = async (screen: typeof SCREEN) =>
      (await tool.run({}, turnContext({ screen }))) as { screen: string; updatedAt: string };

    const second = await answerFor(newer);
    const first = await answerFor(older);

    expect(second.updatedAt).toBe(newer.updatedAt);
    expect(second.screen).toContain('المسار: /notes');
    expect(second.screen).not.toContain('/notes/draft');
    expect(first.screen).toContain('المسار: /notes/draft');
    expect(second.screen).not.toBe(first.screen);
  });

  it('answers a turn with no snapshot at all, rather than a stale page', async () => {
    const answer = await chatAgentTool('get_screen_context')!.run({}, turnContext());

    expect(answer).toEqual({ screen: null, updatedAt: null });
  });

  it('words a proposal in the member’s language, whatever the arguments are', () => {
    expect(chatAgentActionSentence('record_expense', { amount: 12.5, currency: 'USD' })).toBe(
      'تسجيل مصروف — 12.5 USD'
    );
    expect(chatAgentActionSentence('create_habit', { name: 'قراءة' })).toContain('قراءة');

    // A proposal with unreadable arguments — the case confirm refuses — must
    // still draw something rather than take the thread down.
    expect(chatAgentActionSentence('record_expense', null)).toBe('تسجيل مصروف');
    expect(chatAgentActionSentence('nonsense', {})).toBe('إجراء');
  });

  it('shows the fact on a remember card, so the member confirms what will be kept', () => {
    expect(chatAgentActionSentence('remember', { text: 'أحبّ القهوة السادة' })).toBe(
      'حفظ ما أوصيت به — «أحبّ القهوة السادة»'
    );
    expect(chatAgentActionSentence('remember', {})).toBe('حفظ ما أوصيت به');
  });

  it('refuses a fact the row cannot hold, and one that names another member', () => {
    const remember = chatAgentTool('remember');
    expect(remember).not.toBeNull();

    expect(remember!.schema.safeParse({ text: 'ا'.repeat(501) }).success).toBe(false);
    expect(remember!.schema.safeParse({ text: 'تذكّر أنني أحبّ القهوة' }).success).toBe(true);
    expect(
      remember!.schema.safeParse({ text: 'أحبّ القهوة', user_id: 'someone-else' }).success
    ).toBe(false);
  });
});

describe('search_web failure (ADR-0206)', () => {
  it('hands the model the one Arabic sentence, never the vendor’s error text', async () => {
    const searchWeb = vi.fn(async () => {
      throw new Error('search answered 403');
    });
    const tool = chatAgentTool('search_web')!;

    await expect(tool.run({ query: 'سعر الذهب' }, turnContext({ searchWeb }))).rejects.toThrow(
      WEB_SEARCH_UNAVAILABLE
    );
    await expect(tool.run({ query: 'سعر الذهب' }, turnContext({ searchWeb }))).rejects.not.toThrow(
      '403'
    );
  });
});

describe('read_url (ADR-0214)', () => {
  it('is declared only when the deployment has a page reader', () => {
    const names = (hasUrlExtract: boolean) =>
      chatAgentToolDefinitionsForTurn({
        hasApps: false,
        hasScreen: false,
        hasWebSearch: false,
        hasUrlExtract,
        isAdmin: false,
      }).map((definition) => definition.function.name);
    expect(names(false)).not.toContain('read_url');
    expect(names(true)).toContain('read_url');
  });

  it('hands the model one Arabic sentence when a page cannot be read', async () => {
    const readUrl = vi.fn(async () => {
      throw new Error('extract answered 403');
    });
    const tool = chatAgentTool('read_url')!;
    const args = { url: 'https://example.com/a', question: 'ماذا يقول الرابط؟' };

    await expect(tool.run(args, turnContext({ readUrl }))).rejects.toThrow(URL_EXTRACT_UNAVAILABLE);
    await expect(tool.run(args, turnContext({ readUrl }))).rejects.not.toThrow('403');
  });

  it('passes the public address and the question to the reader', async () => {
    const readUrl = vi.fn(async () => ({ sources: [], evidence: '' }));
    const tool = chatAgentTool('read_url')!;
    const args = { url: 'https://example.com/a', question: 'لخّص المقال' };
    await tool.run(args, turnContext({ readUrl }));
    expect(readUrl).toHaveBeenCalledWith(args.url, args.question);
  });
});
