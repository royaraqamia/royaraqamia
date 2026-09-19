import 'server-only';

import { identity } from '@/backend/config/identity';

/**
 * The Admin guard is a caller of the identity module, not its own resolver: it
 * asks for the Admin outcome and throws the bare errors the transport adapters
 * map to 401/403. The allowlist predicate and the mirror sync live in the
 * identity module's Admin reader (ADR-0003).
 */
export async function requireAdminAuth() {
  const resolution = await identity.resolveAdmin();

  if (resolution.kind === 'anonymous') {
    throw new Error('UNAUTHORIZED');
  }
  if (resolution.kind === 'forbidden') {
    throw new Error('FORBIDDEN');
  }

  const { user, client } = resolution.identity;
  return { supabase: client, user };
}
