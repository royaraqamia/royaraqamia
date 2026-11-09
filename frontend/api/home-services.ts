import type { HomeServicesResult } from '@/shared/contracts/home-services';
import { request } from '@/frontend/transport/http';

/**
 * The signed-in visitor's homepage apps (ADR-0146).
 *
 * A failed read is thrown to the caller, like every account view's getter: the
 * provider answers the device's list and marks the read failed, so a network
 * blip costs the member their server order, not the page.
 */

export async function getHomeServices(): Promise<string[]> {
  const result = await request<HomeServicesResult>('/api/me/home-services', {
    cache: 'no-store',
  });
  return result.data ?? [];
}

export async function replaceHomeServices(
  services: readonly string[]
): Promise<HomeServicesResult> {
  try {
    return await request<HomeServicesResult>('/api/me/home-services', {
      method: 'PUT',
      body: JSON.stringify({ services }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
