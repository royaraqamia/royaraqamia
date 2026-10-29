import type { NotesSyncSnapshot } from '@/shared/contracts/notes';
import { request } from '@/frontend/transport/http';

/**
 * The notes sync read. Its caller is `pull.ts`, which owns the merge and the
 * cursor; this function only knows the endpoint and the query string.
 */
export async function getNotesSyncSnapshot(since?: string | null): Promise<NotesSyncSnapshot> {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  const qs = params.toString();
  return request<NotesSyncSnapshot>(`/notes/api/sync${qs ? `?${qs}` : ''}`);
}
