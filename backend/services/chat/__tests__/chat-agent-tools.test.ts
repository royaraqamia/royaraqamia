import { describe, expect, it } from 'vitest';

import {
  chatAgentTool,
  chatAgentToolDefinitions,
  chatAgentTools,
} from '@/backend/services/chat/chat-agent-tools';
import {
  CHAT_AGENT_TOOLS,
  CHAT_AGENT_TOOL_NAMES,
  chatAgentActionSentence,
} from '@/shared/contracts/chat-agent-actions';

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
});
