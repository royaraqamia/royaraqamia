import { createAiChatClient } from '@/backend/clients/ai-chat';
import { createPlanGate } from '@/backend/config/plans';
import { KEYBOARD_REWRITE_COPY } from '@/backend/copy/keyboard-rewrite';
import { KeyboardRewriteService } from '@/backend/services/keyboard/rewrite-service';

/**
 * Composition root for the keyboard's one network action (ADR-0220).
 *
 * The provider is the same gateway as the assistant's, but the service never
 * receives tools, memory or history — only the two messages of a rewrite. A
 * deployment with no provider key returns `null`, which the controller answers
 * with the same one Arabic sentence a failed call gets.
 */
export function createKeyboardRewriteService(): KeyboardRewriteService | null {
  const client = createAiChatClient();
  if (!client) return null;
  return new KeyboardRewriteService((messages, signal) => client.reply(messages, signal));
}

export function keyboardUnavailable(): string {
  return KEYBOARD_REWRITE_COPY.failure;
}

export { createPlanGate as createKeyboardPlanGate };
