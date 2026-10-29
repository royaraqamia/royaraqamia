import 'server-only';

import { cookies, headers } from 'next/headers';
import {
  createServerSupabaseClient,
  createTokenSupabaseClient,
  getPublicSupabase,
} from '@/backend/config/supabase';
import { syncAdminAllowlistMirror } from '@/backend/config/admin-allowlist';
import { isAdmin } from '@/backend/shared/admin-validator';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';
import {
  createAdminIdentityReader,
  createBearerIdentityReader,
  createCookieSessionIdentityReader,
  createIdentityModule,
  createRequestIdentityReader,
  createTokenSessionReader,
  type IdentityModule,
} from '@/backend/identity';

/**
 * Production wiring for the identity seam. Everything that answers "who is the
 * current user?" resolves through this module, so the cookie rule, the client
 * construction and the bearer adapter have one owner.
 */

async function readBearerUser(token: string) {
  const { data, error } = await getPublicSupabase().auth.getUser(token);
  if (error || !data.user) return { user: null };
  return { user: { id: data.user.id, email: data.user.email ?? '' } };
}

const logTokenError = (error: unknown) =>
  logger.error('Error authenticating token', { error: String(error) });

const sessionReader = createCookieSessionIdentityReader({
  getCookies: () => cookies(),
  createClient: (store) => createServerSupabaseClient(store),
});

const bearerReader = createBearerIdentityReader({
  getUser: readBearerUser,
  onError: logTokenError,
});

/**
 * The token-scoped half of the seam. A request that carried a Bearer token is
 * answered by a client carrying that same token, so RLS authorizes the caller
 * rather than whatever cookie jar the process happened to have.
 */
const tokenSessionReader = createTokenSessionReader({
  getUser: readBearerUser,
  createClient: createTokenSupabaseClient,
  onError: logTokenError,
});

const requestReader = createRequestIdentityReader({
  authorization: async () => {
    try {
      return (await headers()).get('authorization');
    } catch {
      // Outside a request (build-time render, tests) there is no header.
      return null;
    }
  },
  session: sessionReader,
  token: tokenSessionReader,
  anonymousClient: getPublicSupabase,
});

const adminReader = createAdminIdentityReader({
  // Admin pages are part of the web surface; the request reader keeps them
  // additive too, without changing the allowlist rule that gates them.
  session: requestReader,
  isAdmin: (email) => isAdmin(email, env.adminEmails),
  // Keep the DB admin allowlist (used by RLS) in sync with ADMIN_EMAILS.
  onAdmin: () => syncAdminAllowlistMirror(env.adminEmails),
});

export const identity: IdentityModule = createIdentityModule(
  sessionReader,
  bearerReader,
  adminReader,
  requestReader
);
