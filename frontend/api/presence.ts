import { request } from '@/frontend/transport/http';

/**
 * Stamp the signed-in member's last seen (ADR 0212). Fire-and-forget by design:
 * a failed heartbeat must never interrupt a message send or a page render.
 */
export async function touchLastSeen(): Promise<void> {
  await request<{ success: boolean }>('/api/me/last-seen', {
    method: 'POST',
    cache: 'no-store',
  });
}
