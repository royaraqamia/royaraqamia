import { bearerReader } from '@/backend/identity/server';

interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * The bearer reader is an adapter at the identity seam: same module, different
 * credential. MCP and LinkSnap clients keep working unchanged.
 */
export async function getAuthenticatedUser(
  authorization: string | null
): Promise<AuthenticatedUser | null> {
  const user = await bearerReader.read(authorization);
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}
