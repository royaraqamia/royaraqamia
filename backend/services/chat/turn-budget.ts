import type { AiChatMessage } from '@/backend/clients/ai-chat';
import { CHAT_AGENT_TOKEN_BUDGET } from '@/shared/contracts/chat';

/**
 * The whole of a turn's context, in tokens: the layers the server injects, then
 * the window of the thread the budget leaves room for (#1455).
 *
 * Before the eyes, the identity block and recall, the six thousand tokens in
 * `CHAT_AGENT_TOKEN_BUDGET` were the history window and nothing else. Each layer
 * added since then is paid for on every turn, so it is a subtraction rather than
 * an addition: `identity + screen + recall + skills + summary + history` stays
 * at the budget, and the history shrinks by exactly what the layers cost. The
 * ceiling does not rise; the window pays.
 *
 * Four characters a token is the estimate the budget is stated in, and the one
 * `trimHistory` has always used. The number is a bound, not a bill: the provider
 * reports the real usage on the turn's last frame.
 */

/** Roughly four characters a token, which is the estimate the budget is stated in. */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * What the context layers already spend. `turnContextMessages` returns them as
 * system messages, so their cost is the sum of their bodies and nothing else.
 */
export function contextTokenCount(messages: readonly Pick<AiChatMessage, 'content'>[]): number {
  return messages.reduce((total, message) => total + approximateTokens(message.content), 0);
}

/**
 * What the history may spend: the turn's one budget, less the layers already in
 * the prompt and the reserve a declared web search takes (ADR-0206).
 *
 * A budget of zero is not an error. `trimHistory` keeps the newest message
 * whatever it is told — the question the member just asked is the one line a
 * turn cannot answer without — so a pathological set of layers still leaves a
 * turn, and the arithmetic never turns a large block into a negative allowance.
 */
export function historyTokenBudget(
  context: readonly Pick<AiChatMessage, 'content'>[],
  { reserve = 0 }: { reserve?: number } = {}
): number {
  const spent = contextTokenCount(context) + Math.max(0, reserve);
  return Math.max(0, CHAT_AGENT_TOKEN_BUDGET - spent);
}
