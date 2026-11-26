import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { ChatAgentToolsDeps } from '@/backend/services/chat/chat-agent-tools-deps';
import {
  chatAgentToolDeclarations,
  type AssistantSuggestionCondition,
  type ChatAgentTool,
} from '@/backend/services/chat/chat-agent-tools';
import { capabilityId } from '@/backend/services/tools/registry';
import type { AssistantOpening, AssistantSuggestion } from '@/shared/contracts/chat';
import { damascusDateKey } from '@/shared/time';

/**
 * The assistant's first screen, from one declaration (ADR-0183, #1859, #1918).
 *
 * The questions are projected from the tool registry, not kept in a copy file:
 * the entry that can answer a question carries the question, so removing a
 * capability removes its advertisement in the same change. Only tier 0 reads
 * are projected — a tool the member must confirm is not an opening question.
 *
 * The projection is the member's state, not a constant (#1918). An entry whose
 * question needs rows the member does not hold — a habit, a Quran bookmark or
 * reading position, a connected app — names that condition and is dropped while
 * it is false, so the first question is never one the product answers empty.
 * What survives is ranked by how much of that capability the member holds, so
 * the three slots go to the products this member actually uses; a question that
 * holds for everyone (the month's spend, the day's digest) fills the rest.
 *
 * The lead is the member's own state when we can read it. It is best effort:
 * a product with no rows, or a read that fails, simply leaves the generic
 * introduction in place rather than making the assistant's first screen an
 * error page.
 */

export interface AssistantOpeningDeps {
  habits: ChatAgentToolsDeps['habits'];
  spendtrack: ChatAgentToolsDeps['spendtrack'];
  quran: ChatAgentToolsDeps['quran'];
  mcp: Pick<ChatAgentToolsDeps['mcp'], 'createConnectionService'>;
}

/** How much of each condition-bearing capability the member holds. */
export type AssistantSuggestionState = Record<AssistantSuggestionCondition, number>;

/**
 * A member with no rows at all. It is the default so a caller that has not read
 * the member gets the unconditional questions rather than an invented one.
 */
export const EMPTY_SUGGESTION_STATE: AssistantSuggestionState = {
  habits: 0,
  'quran-reading': 0,
  'connected-app': 0,
};

/** The most questions one first screen holds, in the panel and on the page. */
const SUGGESTIONS_MAX = 3;

/**
 * The questions a first screen may offer for a member in this state.
 *
 * Dropped first (a condition that is false), then ranked by the member's own
 * count for that capability — the most-used product is asked about first — with
 * registry order breaking a tie, then cut to three.
 */
export function projectAssistantSuggestions(
  tools: readonly ChatAgentTool[] = chatAgentToolDeclarations(),
  state: AssistantSuggestionState = EMPTY_SUGGESTION_STATE
): AssistantSuggestion[] {
  return tools
    .filter((tool) => tool.tier === 0 && Boolean(tool.suggestedAsk))
    .map((tool, order) => ({ tool, order, weight: suggestionWeight(tool, state) }))
    .filter(
      (entry): entry is { tool: ChatAgentTool; order: number; weight: number } =>
        entry.weight !== null
    )
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .slice(0, SUGGESTIONS_MAX)
    .map(({ tool }) => ({
      toolId: capabilityId(tool.product, tool.capabilityName ?? tool.name),
      ask: tool.suggestedAsk as string,
    }));
}

/** The member's count behind a question, or null when its condition is false. */
function suggestionWeight(tool: ChatAgentTool, state: AssistantSuggestionState): number | null {
  if (!tool.suggestedAskWhen) return 0;
  const held = state[tool.suggestedAskWhen];
  return held > 0 ? held : null;
}

/**
 * The member facts the projection reads: one count per condition-bearing
 * capability, each from the product's own service rather than a second query.
 *
 * Every probe is best effort. A product the member has never opened is a zero,
 * and a read that fails is a zero too: the first screen falls back to the
 * unconditional questions instead of becoming an error page.
 */
export async function readAssistantSuggestionState(
  userId: string,
  supabase: SupabaseClient<Database>,
  deps: AssistantOpeningDeps
): Promise<AssistantSuggestionState> {
  const [habits, quranReading, connectedApp] = await Promise.all([
    countOrZero(async () => {
      const { service } = deps.habits.createService(userId, supabase);
      const all = await service.getAllHabits();
      return all.filter((habit) => !habit.archived && !habit.deletedAt).length;
    }),
    countOrZero(async () => {
      // One read gives both halves of the condition: the reader's place, and
      // the bookmarks not tombstoned. Either one makes the question honest.
      const snapshot = await deps.quran.createService(supabase).getSyncSnapshot(userId);
      const bookmarks = snapshot.bookmarks.filter((bookmark) => !bookmark.deletedAt).length;
      return bookmarks + (snapshot.position ? 1 : 0);
    }),
    countOrZero(async () => {
      const connections = await deps.mcp.createConnectionService().list(userId);
      return connections.length;
    }),
  ]);

  return { habits, 'quran-reading': quranReading, 'connected-app': connectedApp };
}

async function countOrZero(read: () => Promise<number>): Promise<number> {
  try {
    return await read();
  } catch {
    return 0;
  }
}

/** A member-specific line, or null when there is nothing honest to lead with. */
export async function assistantOpeningLead(
  userId: string,
  supabase: SupabaseClient<Database>,
  deps: Pick<AssistantOpeningDeps, 'habits' | 'spendtrack'>
): Promise<string | null> {
  const today = damascusDateKey();

  try {
    const { service: habits } = deps.habits.createService(userId, supabase);
    const [all, logs] = await Promise.all([habits.getAllHabits(), habits.getLogs(today, today)]);
    const done = new Set(logs.filter((log) => log.completed).map((log) => log.habitId));
    const pending = all.filter(
      (habit) =>
        !habit.archived && !habit.deletedAt && habit.frequency === 'daily' && !done.has(habit.id)
    ).length;

    if (pending === 1) return 'عندك عادة واحدة لم تُنجز اليوم';
    if (pending === 2) return 'عندك عادتان لم تُنجزا اليوم';
    if (pending > 2) return `عندك ${pending} عادات لم تُنجز اليوم`;
  } catch {
    // A product the member has never opened still gives the assistant a first
    // screen: the generic sentence carries on.
  }

  try {
    const spendtrack = deps.spendtrack.createService(supabase);
    const total = await spendtrack.getTotalExpenses(userId, `${today.slice(0, 7)}-01`, today, null);
    if (total && total > 0) {
      return `مصروفاتك هذا الشهر ${new Intl.NumberFormat('en-US').format(total)}`;
    }
  } catch {
    // Same rule as habits: no data is a state, not a failed screen.
  }

  return null;
}

/** The whole opening read: the member's line and the questions they can send. */
export async function assistantOpening(
  userId: string,
  supabase: SupabaseClient<Database>,
  deps: AssistantOpeningDeps,
  tools: readonly ChatAgentTool[] = chatAgentToolDeclarations()
): Promise<AssistantOpening> {
  const [lead, state] = await Promise.all([
    assistantOpeningLead(userId, supabase, deps),
    readAssistantSuggestionState(userId, supabase, deps),
  ]);
  return { lead, suggestions: projectAssistantSuggestions(tools, state) };
}
