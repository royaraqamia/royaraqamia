import { describe, expect, it } from 'vitest';

import {
  chatAgentTool,
  chatAgentToolDefinitions,
  chatAgentToolDefinitionsForTurn,
  chatAgentTools,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import type { ScreenContext } from '@/shared/contracts/screen-context';
import {
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
      chatAgentToolDefinitionsForTurn(input).map((definition) => definition.function.name);

    expect(names({ hasApps: false, hasScreen: false })).not.toContain('get_screen_context');
    expect(names({ hasApps: false, hasScreen: true })).toContain('get_screen_context');
    // A connected app does not make a screen exist.
    expect(names({ hasApps: true, hasScreen: false })).not.toContain('get_screen_context');
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
