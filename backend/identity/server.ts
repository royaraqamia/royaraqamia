import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient, getPublicSupabase } from '@/backend/config/supabase';
import { syncAdminAllowlistMirror } from '@/backend/config/admin-allowlist';
import { isAdmin } from '@/backend/shared/admin-validator';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';
import {
  createAdminIdentityReader,
  createBearerIdentityReader,
  createCookieSessionIdentityReader,
  createIdentityModule,
  type IdentityModule,
} from '@/backend/identity';

/**
 * Production wiring for the identity seam. Everything that answers "who is the
 * current user?" resolves through this module, so the cookie rule, the client
 * construction and the bearer adapter have one owner.
 */

const sessionReader = createCookieSessionIdentityReader({
  getCookies: () => cookies(),
  createClient: (store) => createServerSupabaseClient(store),
});

const adminReader = createAdminIdentityReader({
  session: sessionReader,
  isAdmin: (email) => isAdmin(email, env.adminEmails),
  // Keep the DB admin allowlist (used by RLS) in sync with ADMIN_EMAILS.
  onAdmin: () => syncAdminAllowlistMirror(env.adminEmails),
});

export const identity: IdentityModule = createIdentityModule(sessionReader, adminReader);

export const bearerReader = createBearerIdentityReader({
  getUser: async (token) => {
    const { data, error } = await getPublicSupabase().auth.getUser(token);
    if (error || !data.user) return { user: null };
    return { user: { id: data.user.id, email: data.user.email ?? '' } };
  },
  onError: (error) => logger.error('Error authenticating token', { error: String(error) }),
});
