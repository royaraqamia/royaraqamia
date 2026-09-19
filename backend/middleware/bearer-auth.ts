import { identity } from '@/backend/config/identity';
import type { AuthUser } from '@/backend/identity';

/**
 * The bearer reader is an adapter at the identity seam: same module, different
 * credential. MCP and LinkSnap clients keep working unchanged.
 */
export async function getAuthenticatedUser(authorization: string | null): Promise<AuthUser | null> {
  return identity.resolveBearer(authorization);
}
