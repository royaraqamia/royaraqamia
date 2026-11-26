import { describe, expect, it, vi } from 'vitest';

import {
  EMPTY_SUGGESTION_STATE,
  assistantOpening,
  assistantOpeningLead,
  projectAssistantSuggestions,
  readAssistantSuggestionState,
} from '@/backend/services/chat/assistant-opening';
import { chatAgentToolDeclarations } from '@/backend/services/chat/chat-agent-tools';
import { agentCapabilities } from '@/backend/services/tools/registry';
import { damascusDateKey } from '@/shared/time';

/** A member who has used every product the opening can advertise. */
const activeMember = {
  habits: 3,
  'quran-reading': 12,
  'connected-app': 2,
} as const;

const idsOf = (suggestions: Array<{ toolId: string }>): string[] =>
  suggestions.map((suggestion) => suggestion.toolId);

describe('the assistant first screen (#1859)', () => {
  it('offers at least two questions, each naming a real tier-0 capability', () => {
    const suggestions = projectAssistantSuggestions(chatAgentToolDeclarations(), activeMember);
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
    const ids = idsOf(
      projectAssistantSuggestions(withoutNews, {
        ...EMPTY_SUGGESTION_STATE,
        habits: 1,
      })
    );

    expect(ids).toContain('habitflow.get_habits_summary');
    expect(ids).toContain('spendtrack.get_expenses_summary');
    expect(ids).not.toContain('news.get_latest_news');
  });

  it('does not advertise a tool that needs confirmation', () => {
    const tools = chatAgentToolDeclarations().map((tool) =>
      tool.name === 'get_habits_summary' ? { ...tool, tier: 2 as const } : tool
    );
    expect(idsOf(projectAssistantSuggestions(tools, activeMember))).not.toContain(
      'habitflow.get_habits_summary'
    );
  });

  it('never asks a member with no habits about habits (#1918)', () => {
    const ids = idsOf(
      projectAssistantSuggestions(chatAgentToolDeclarations(), EMPTY_SUGGESTION_STATE)
    );

    expect(ids).not.toContain('habitflow.get_habits_summary');
    // The unconditional questions still draw, so the screen is never blank.
    expect(ids).toEqual(['spendtrack.get_expenses_summary', 'news.get_latest_news']);
  });

  it('offers the Quran reader to a member with a bookmark or a reading position', () => {
    const ids = idsOf(
      projectAssistantSuggestions(chatAgentToolDeclarations(), {
        ...EMPTY_SUGGESTION_STATE,
        'quran-reading': 1,
      })
    );

    expect(ids).toContain('quran.list_surahs');
    expect(ids).not.toContain('habitflow.get_habits_summary');
  });

  it('offers the connected app to a member who has one', () => {
    const ids = idsOf(
      projectAssistantSuggestions(chatAgentToolDeclarations(), {
        ...EMPTY_SUGGESTION_STATE,
        'connected-app': 1,
      })
    );

    expect(ids).toContain('mcp-store.list_apps');
  });

  it('keeps three questions at most, the most-used capability first', () => {
    const ids = idsOf(projectAssistantSuggestions(chatAgentToolDeclarations(), activeMember));

    expect(ids).toHaveLength(3);
    // The Quran is this member's widest-used product (12 records), so the
    // reader is the first question; habits (3) and the app (2) follow it.
    expect(ids).toEqual([
      'quran.list_surahs',
      'habitflow.get_habits_summary',
      'mcp-store.list_apps',
    ]);
  });

  it('reads the member facts from the product services themselves', async () => {
    const deps = {
      habits: {
        createService: () => ({
          service: {
            getAllHabits: vi.fn(async () => [
              { id: 'a', archived: false, deletedAt: null },
              { id: 'b', archived: true, deletedAt: null },
              { id: 'c', archived: false, deletedAt: '2026-11-01T00:00:00.000Z' },
            ]),
          },
        }),
      },
      quran: {
        createService: () => ({
          getSyncSnapshot: vi.fn(async () => ({
            position: { surah: 2, ayah: 255, updatedAt: '2026-11-26T00:00:00.000Z' },
            bookmarks: [
              { clientId: 'b1', deletedAt: null },
              { clientId: 'b2', deletedAt: null },
              { clientId: 'b3', deletedAt: '2026-11-20T00:00:00.000Z' },
            ],
            cursor: null,
          })),
        }),
      },
      mcp: { createConnectionService: () => ({ list: vi.fn(async () => [{ id: 'app-1' }]) }) },
    };

    const state = await readAssistantSuggestionState('user-1', {} as never, deps as never);

    // Archived and tombstoned habits are not the member's daily state; the
    // Quran counts live bookmarks plus the place the reader left.
    expect(state).toEqual({ habits: 1, 'quran-reading': 3, 'connected-app': 1 });
  });

  it('drops a condition whose read fails rather than failing the screen', async () => {
    const deps = {
      habits: {
        createService: () => {
          throw new Error('no habitflow');
        },
      },
      quran: {
        createService: () => ({
          getSyncSnapshot: async () => {
            throw new Error('no quran');
          },
        }),
      },
      mcp: {
        createConnectionService: () => ({
          list: async () => {
            throw new Error('no store');
          },
        }),
      },
    };

    const state = await readAssistantSuggestionState('user-1', {} as never, deps as never);
    expect(state).toEqual(EMPTY_SUGGESTION_STATE);

    const opening = await assistantOpening(
      'user-1',
      {} as never,
      {
        ...deps,
        spendtrack: { createService: () => ({ getTotalExpenses: async () => 0 }) },
      } as never
    );
    expect(opening.suggestions.map((suggestion) => suggestion.toolId)).toEqual([
      'spendtrack.get_expenses_summary',
      'news.get_latest_news',
    ]);
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
