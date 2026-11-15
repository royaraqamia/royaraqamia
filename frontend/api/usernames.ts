import { MentionResolveResponseSchema } from '@/shared/contracts/users';
import { request } from '@/frontend/transport/http';

/**
 * Which of these handles name a member (ADR-0192).
 *
 * The answer is allowed to be empty for a reason that is not a failure: an
 * unknown handle is text, and a lookup that cannot run is the same text. So this
 * never throws — a surface renders the writer's words either way, and only the
 * underline is missing.
 */
export async function resolveMentionHandles(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];

  try {
    const answer = await request<unknown>('/api/users/mentions', {
      method: 'POST',
      body: JSON.stringify({ handles }),
      cache: 'no-store',
    });
    const parsed = MentionResolveResponseSchema.safeParse(answer);
    return parsed.success ? parsed.data.handles : [];
  } catch {
    return [];
  }
}
