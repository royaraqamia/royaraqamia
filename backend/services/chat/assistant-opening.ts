import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { ChatAgentToolsDeps } from '@/backend/services/chat/chat-agent-tools-deps';
import {
  chatAgentToolDeclarations,
  type ChatAgentTool,
} from '@/backend/services/chat/chat-agent-tools';
import { capabilityId } from '@/backend/services/tools/registry';
import type { AssistantOpening, AssistantSuggestion } from '@/shared/contracts/chat';
import { damascusDateKey } from '@/shared/time';

/**
 * The assistant's first screen, from one declaration (ADR-0183, #1859).
 *
 * The questions are projected from the tool registry, not kept in a copy file:
 * the entry that can answer a question carries the question, so removing a
 * capability removes its advertisement in the same change. Only tier 0 reads
 * are projected — a tool the member must confirm is not an opening question.
 *
 * The lead is the member's own state when we can read it. It is best effort:
 * a product with no rows, or a read that fails, simply leaves the generic
 * introduction in place rather than making the assistant's first screen an
 * error page.
 */

export interface AssistantOpeningDeps {
  habits: ChatAgentToolsDeps['habits'];
  spendtrack: ChatAgentToolsDeps['spendtrack'];
}

/** The questions a first screen may offer, in registry order. */
export function projectAssistantSuggestions(
  tools: readonly ChatAgentTool[] = chatAgentToolDeclarations()
): AssistantSuggestion[] {
  return tools
    .filter((tool) => tool.tier === 0 && Boolean(tool.suggestedAsk))
    .slice(0, 3)
    .map((tool) => ({
      toolId: capabilityId(tool.product, tool.capabilityName ?? tool.name),
      ask: tool.suggestedAsk as string,
    }));
}

/** A member-specific line, or null when there is nothing honest to lead with. */
export async function assistantOpeningLead(
  userId: string,
  supabase: SupabaseClient<Database>,
  deps: AssistantOpeningDeps
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
  const [lead, suggestions] = await Promise.all([
    assistantOpeningLead(userId, supabase, deps),
    Promise.resolve(projectAssistantSuggestions(tools)),
  ]);
  return { lead, suggestions };
}
