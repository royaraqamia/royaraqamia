import { describe, expect, it } from 'vitest';

import { trimHistory } from '@/backend/services/chat/chat-agent-service';
import {
  approximateTokens,
  contextTokenCount,
  historyTokenBudget,
} from '@/backend/services/chat/turn-budget';
import {
  identityBlock,
  turnContextMessages,
  type TurnIdentity,
} from '@/backend/services/chat/turn-identity';
import { screenContextMessages } from '@/backend/services/chat/turn-screen';
import { skillBlock, type SkillHit } from '@/backend/shared/domain/agent-skills';
import { recallBlock, type RecalledMemory } from '@/backend/shared/domain/agent-memory';
import {
  summaryBlock,
  type ConversationSummary,
} from '@/backend/shared/domain/conversation-summary';
import {
  CHAT_AGENT_HISTORY_MAX,
  CHAT_AGENT_TOKEN_BUDGET,
  type ChatMessage,
} from '@/shared/contracts/chat';
import type { ScreenContext } from '@/shared/contracts/screen-context';
import { WEB_SEARCH_TOKEN_RESERVE } from '@/shared/contracts/web-search';
import fixture from './fixtures/turn-cost.json';

/**
 * What the eyes and memory cost a turn (#1455).
 *
 * The budget is one number and every layer is a subtraction from it: what the
 * identity, screen, recall, summary and specialist blocks spend is taken out of
 * the history window rather than added on top of it. The fixture is the turn
 * this test measures, so the numbers in `docs/assistant/roadmap.md` are the
 * numbers this test reproduces — a block that grows fails here before it
 * silently lifts the ceiling.
 */

const identity = fixture.identity as TurnIdentity;
const screen = fixture.screen as ScreenContext;
const recalled = fixture.recalled as RecalledMemory[];
const summary = fixture.summary as ConversationSummary;
const skills = fixture.skills as SkillHit[];

function message(id: string, senderKind: 'user' | 'agent', body: string): ChatMessage {
  return {
    id,
    conversationId: 'conversation-1',
    senderId: senderKind === 'user' ? 'user-1' : null,
    senderKind,
    body,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-11-20T11:30:00.000Z',
    attachments: [],
    replyTo: null,
  };
}

function fixtureThread(): ChatMessage[] {
  return fixture.thread.map((entry) =>
    message(entry.id, entry.senderKind as 'user' | 'agent', entry.body)
  );
}

/** The over-window thread the budget has to trim: twenty long messages. */
function longThread(): ChatMessage[] {
  const { count, repeat, senderPattern, body } = fixture.longThread;
  return Array.from({ length: count }, (_, index) =>
    message(
      `long-${index + 1}`,
      senderPattern[index % senderPattern.length] as 'user' | 'agent',
      body.repeat(repeat)
    )
  );
}

function tokensOf(messages: readonly { content: string }[]): number {
  return messages.reduce((total, entry) => total + approximateTokens(entry.content), 0);
}

describe('the per-turn context budget', () => {
  const context = turnContextMessages(identity, screen, recalled, summary, skills);

  it('prices every layer the turn injects, and no layer twice', () => {
    const layers = {
      identity: approximateTokens(identityBlock(identity)),
      screen: tokensOf(screenContextMessages(screen)),
      recall: approximateTokens(recallBlock(recalled)),
      summary: approximateTokens(summaryBlock(summary)),
      skills: approximateTokens(skillBlock(skills)),
    };

    const summed = Object.values(layers).reduce((total, value) => total + value, 0);

    // The block does exactly what the service sends: one system message per
    // layer, in the order ADR-0182 fixes.
    expect(context).toHaveLength(5);
    expect(layers).toEqual({
      identity: fixture.expected.identity,
      screen: fixture.expected.screen,
      recall: fixture.expected.recall,
      summary: fixture.expected.summary,
      skills: fixture.expected.skills,
    });
    expect(summed).toBe(fixture.expected.context);
    expect(contextTokenCount(context)).toBe(summed);
    expect(contextTokenCount(context)).toBe(fixture.expected.context);
  });

  it('leaves the history the remainder of the one budget, never more', () => {
    const budget = historyTokenBudget(context);

    expect(contextTokenCount(context) + budget).toBe(CHAT_AGENT_TOKEN_BUDGET);
    expect(budget).toBe(fixture.expected.historyBudget);
    // The ceiling did not rise: the layers are paid for out of the window.
    expect(budget).toBeLessThan(CHAT_AGENT_TOKEN_BUDGET);
  });

  it('reserves the web evidence out of the same remainder', () => {
    const budget = historyTokenBudget(context, { reserve: WEB_SEARCH_TOKEN_RESERVE });

    expect(contextTokenCount(context) + budget + WEB_SEARCH_TOKEN_RESERVE).toBe(
      CHAT_AGENT_TOKEN_BUDGET
    );
    expect(budget).toBe(fixture.expected.historyBudgetWithSearch);
  });

  it('keeps a pathological set of layers from turning the window negative', () => {
    const huge = [{ role: 'system' as const, content: 'ا'.repeat(CHAT_AGENT_TOKEN_BUDGET * 8) }];

    expect(historyTokenBudget(huge)).toBe(0);
  });
});

describe('the history the smaller window holds', () => {
  const context = turnContextMessages(identity, screen, recalled, summary, skills);

  it('fits the representative thread inside what is left', () => {
    const trimmed = trimHistory(
      fixtureThread(),
      CHAT_AGENT_HISTORY_MAX,
      historyTokenBudget(context)
    );

    expect(tokensOf(trimmed) + contextTokenCount(context)).toBeLessThanOrEqual(
      CHAT_AGENT_TOKEN_BUDGET
    );
    // The newest exchange is the question of this turn: the trim never costs it.
    expect(trimmed.at(-1)?.content).toBe(fixture.thread.at(-1)?.body);
  });

  it('trims the over-window thread where the old full window would have breached', () => {
    const before = trimHistory(longThread(), CHAT_AGENT_HISTORY_MAX, CHAT_AGENT_TOKEN_BUDGET);
    const after = trimHistory(longThread(), CHAT_AGENT_HISTORY_MAX, historyTokenBudget(context));

    // Before #1455 the window was trimmed to the whole budget and the layers
    // were added on top of it: the turn's context went past its one ceiling.
    expect(tokensOf(before) + contextTokenCount(context)).toBeGreaterThan(CHAT_AGENT_TOKEN_BUDGET);
    // After: the window is the remainder, so the turn stays inside the budget.
    expect(tokensOf(after) + contextTokenCount(context)).toBeLessThanOrEqual(
      CHAT_AGENT_TOKEN_BUDGET
    );
    // And the messages the smaller window drops are the old ones: the summary
    // above it is what carries them (ADR-0182 decision 4).
    expect(tokensOf(after)).toBeLessThan(tokensOf(before));
    expect(after).toHaveLength(before.length - fixture.expected.longThreadDropped);
    expect(after.at(-1)?.content).toBe(longThread().at(-1)?.body);
    expect(summaryBlock(summary)).toContain('ميزانية الشهر');
  });
});

describe('the assembly a turn pays before the provider is called', () => {
  it('is measured, not guessed: wall clock for the assembled context', () => {
    const thread = longThread();
    const runs = 2_000;

    // Warm the code paths so the first run's JIT does not dominate the sample.
    for (let index = 0; index < 50; index += 1) {
      const context = turnContextMessages(identity, screen, recalled, summary, skills);
      trimHistory(thread, CHAT_AGENT_HISTORY_MAX, historyTokenBudget(context));
    }

    const started = performance.now();
    for (let index = 0; index < runs; index += 1) {
      // The layers a watched turn builds, then the history they leave room for.
      const context = turnContextMessages(identity, screen, recalled, summary, skills);
      trimHistory(thread, CHAT_AGENT_HISTORY_MAX, historyTokenBudget(context));
    }
    const perRunMs = (performance.now() - started) / runs;

    // A generous ceiling, not a performance gate: assembly is string work on the
    // fixture and must never become a provider-sized wait.
    expect(perRunMs).toBeLessThan(50);
  });
});
