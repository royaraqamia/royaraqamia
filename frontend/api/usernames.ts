/**
 * Which of these handles name a member (ADR-0192).
 *
 * Deliberately a bare `fetch`, not the app's `request` helper: this module sits
 * in the client graph of every surface that renders a card or a bubble, and the
 * shared transport (and the schema validation behind it) is weight the route's
 * budget cannot carry for a list of strings. The response is read structurally
 * for the same reason — the server still validates its own input, and the only
 * thing this side can do with a surprising body is show text without underlines.
 *
 * The answer is allowed to be empty for a reason that is not a failure: an
 * unknown handle is text, and a lookup that cannot run is the same text. So this
 * never throws — a surface renders the writer's words either way, and only the
 * underline is missing.
 */
export async function resolveMentionHandles(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];

  try {
    const response = await fetch('/api/users/mentions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handles }),
      cache: 'no-store',
    });
    if (!response.ok) return [];

    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return [];

    const answer = (body as { handles?: unknown }).handles;
    return Array.isArray(answer)
      ? answer.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}
