import { describe, expect, it, vi } from 'vitest';

import {
  assistantOpeningLead,
  projectAssistantSuggestions,
} from '@/backend/services/chat/assistant-opening';
import { chatAgentToolDeclarations } from '@/backend/services/chat/chat-agent-tools';
import { agentCapabilities } from '@/backend/services/tools/registry';
import { damascusDateKey } from '@/shared/time';

describe('the assistant first screen (#1859)', () => {
  it('offers at least two questions, each naming a real tier-0 capability', () => {
    const suggestions = projectAssistantSuggestions();
    expect(suggestions.length).toBeGreaterThanOrEqual(2);

    const capabilities = new Map(
      agentCapabilities().map((capability) => [capability.id, capability])
    );
    for (const suggestion of suggestions) {
      const capability = capabilities.get(suggestion.toolId);
      expect(capability, `${suggestion.toolId} is not in the registry`).toBeDefined();
      expect(capability?.tier).toBe(0);
      expect(suggestion.ask.length).toBeGreaterThan(0);
    }
  });

  it('drops a tool the moment its entry leaves the projection', () => {
    const all = chatAgentToolDeclarations();
    const withoutNews = all.filter((tool) => tool.name !== 'get_latest_news');
    const ids = projectAssistantSuggestions(withoutNews).map((suggestion) => suggestion.toolId);

    expect(ids).toContain('habitflow.get_habits_summary');
    expect(ids).toContain('spendtrack.get_expenses_summary');
    expect(ids).not.toContain('news.get_latest_news');
  });

  it('does not advertise a tool that needs confirmation', () => {
    const tools = chatAgentToolDeclarations().map((tool) =>
      tool.name === 'get_habits_summary' ? { ...tool, tier: 2 as const } : tool
    );
    expect(projectAssistantSuggestions(tools).map((item) => item.toolId)).not.toContain(
      'habitflow.get_habits_summary'
    );
  });

  it('leads with today’s unfinished habits when the member has them', async () => {
    const today = damascusDateKey();
    const deps = {
      habits: {
        createService: () => ({
          service: {
            getAllHabits: vi.fn(async () => [
              { id: 'a', name: 'a', frequency: 'daily', archived: false },
              { id: 'b', name: 'b', frequency: 'daily', archived: false },
            ]),
            getLogs: vi.fn(async () => [{ habitId: 'a', date: today, completed: true }]),
          },
        }),
      },
      spendtrack: { createService: () => ({ getTotalExpenses: vi.fn(async () => 0) }) },
    };

    const lead = await assistantOpeningLead('user-1', {} as never, deps as never);
    expect(lead).toBe('عندك عادة واحدة لم تُنجز اليوم');
  });

  it('falls back to the month’s spending when there are no habits to report', async () => {
    const deps = {
      habits: {
        createService: () => ({
          service: { getAllHabits: vi.fn(async () => []), getLogs: vi.fn(async () => []) },
        }),
      },
      spendtrack: { createService: () => ({ getTotalExpenses: vi.fn(async () => 1234) }) },
    };

    const lead = await assistantOpeningLead('user-1', {} as never, deps as never);
    expect(lead).toBe('مصروفاتك هذا الشهر 1,234');
  });
});
