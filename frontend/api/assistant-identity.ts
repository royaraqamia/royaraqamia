import type {
  AssistantIdentityInput,
  AssistantIdentityResult,
} from '@/shared/contracts/assistant-identity';
import { request } from '@/frontend/transport/http';

/**
 * The member's own assistant identity (ADR-0224).
 *
 * A failed read is thrown, like every settings getter: "still نور" and "we could
 * not tell you what you named it" must not look the same on a page whose job is
 * to show the member their own name. A save or a reset answers the server's
 * sentence, which the page draws.
 */

export async function getAssistantIdentity(): Promise<AssistantIdentityResult> {
  return request<AssistantIdentityResult>('/api/account/assistant/identity', {
    cache: 'no-store',
  });
}

export async function saveAssistantIdentity(
  input: AssistantIdentityInput
): Promise<AssistantIdentityResult> {
  return write({ method: 'PUT', body: JSON.stringify(input) });
}

export async function resetAssistantIdentity(): Promise<AssistantIdentityResult> {
  return write({ method: 'DELETE' });
}

async function write(options: {
  method: 'PUT' | 'DELETE';
  body?: string;
}): Promise<AssistantIdentityResult> {
  try {
    return await request<AssistantIdentityResult>('/api/account/assistant/identity', {
      method: options.method,
      ...(options.body ? { body: options.body } : {}),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
