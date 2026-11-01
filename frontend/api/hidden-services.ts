import type { HiddenServicesResult, HiddenServiceKey } from '@/shared/contracts/hidden-services';
import { request } from '@/frontend/transport/http';

/**
 * The signed-in visitor's hidden services (ADR-0112).
 *
 * A failed read is thrown to the caller, like every account view's getter: the
 * provider turns that into "show everything", which is today's menu and therefore
 * a state the user recognises — never a silently empty menu.
 */

export async function getHiddenServices(): Promise<string[]> {
  const result = await request<HiddenServicesResult>('/api/me/hidden-services', {
    cache: 'no-store',
  });
  return result.data ?? [];
}

export async function replaceHiddenServices(
  hidden: readonly HiddenServiceKey[]
): Promise<HiddenServicesResult> {
  try {
    return await request<HiddenServicesResult>('/api/me/hidden-services', {
      method: 'PUT',
      body: JSON.stringify({ hidden }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
