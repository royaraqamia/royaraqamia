import type {
  AssistantIdentityInput,
  AssistantIdentityResult,
} from '@/shared/contracts/assistant-identity';
import { request } from '@/frontend/transport/http';

/**
 * The member's own assistant identity (ADR-0224, ADR-0228).
 *
 * A failed read is thrown, like every settings getter: "still نور" and "we could
 * not tell you what you named it" must not look the same on a page whose job is
 * to show the member their own name. A save or a reset answers the server's
 * sentence, which the page draws.
 *
 * The face has its own two calls for the reason the account page has two: a file
 * is not JSON, and one identity write must not carry bytes it never read.
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

export async function uploadAssistantAvatar(file: File): Promise<AssistantIdentityResult> {
  const formData = new FormData();
  formData.append('file', file);
  return write({ method: 'POST', body: formData });
}

export async function removeAssistantAvatar(): Promise<AssistantIdentityResult> {
  return write({ method: 'DELETE', path: '/api/account/assistant/avatar' });
}

async function write(options: {
  method: 'PUT' | 'POST' | 'DELETE';
  body?: string | FormData;
  path?: string;
}): Promise<AssistantIdentityResult> {
  try {
    return await request<AssistantIdentityResult>(
      options.path ?? '/api/account/assistant/identity',
      {
        method: options.method,
        ...(options.body ? { body: options.body } : {}),
      }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
