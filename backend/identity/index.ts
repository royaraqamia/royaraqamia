import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { hasSessionCookie } from '@/backend/shared/session-cookie';

/**
 * The identity seam.
 *
 * "Who is the current user?" has exactly one owner: this module. It owns the
 * session-cookie rule, the client construction and the difference between
 * "no session", "a session" and "a session that is not an Admin". The page
 * guard, the optional-user reader, the cached session verifier, the Admin guard
 * and the bearer reader are callers, not resolvers.
 *
 * The readers are injected, so the module is testable without a live session and
 * the bearer path is a declared adapter at the same seam rather than an
 * accidental copy of the cookie path.
 */

export interface AuthUser {
  id: string;
  email?: string;
}

/** A resolved request identity: the user (if any) and the client scoped to it. */
export interface ResolvedIdentity {
  user: AuthUser | null;
  client: SupabaseClient<Database> | null;
}

/** Reads the session-cookie identity. `readOptional` never throws. */
export interface SessionIdentityReader {
  read(): Promise<ResolvedIdentity>;
  readOptional(): Promise<ResolvedIdentity>;
}

/** Reads a bearer-token identity. */
export interface BearerIdentityReader {
  read(authorization: string | null): Promise<AuthUser | null>;
}

/**
 * The three outcomes the guards need. `anonymous` and `forbidden` are distinct
 * so an Admin policy can answer 401 versus 403 without inspecting a message.
 */
export type AdminResolution =
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'admin'; identity: ResolvedIdentity & { user: AuthUser } };

export interface AdminIdentityReader {
  read(): Promise<AdminResolution>;
}

interface CookieStoreLike {
  getAll(): ReadonlyArray<{ name: string; value: string }>;
}

export interface CookieSessionReaderDeps<TStore extends CookieStoreLike> {
  getCookies: () => Promise<TStore>;
  createClient: (store: TStore) => Promise<SupabaseClient<Database>>;
}

function toAuthUser(
  user: { id: string; email?: string | null } | null | undefined
): AuthUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? undefined };
}

/**
 * The production session reader: one cookie rule decides whether it is safe to
 * skip the network round-trip, and one place builds the scoped client.
 */
export function createCookieSessionIdentityReader<TStore extends CookieStoreLike>(
  deps: CookieSessionReaderDeps<TStore>
): SessionIdentityReader {
  return {
    async read() {
      const store = await deps.getCookies();
      const client = await deps.createClient(store);
      const { data } = await client.auth.getUser();
      return { user: toAuthUser(data?.user), client };
    },

    async readOptional() {
      try {
        const store = await deps.getCookies();
        if (!hasSessionCookie(store.getAll())) return { user: null, client: null };
        const client = await deps.createClient(store);
        const { data } = await client.auth.getUser();
        if (!data?.user) return { user: null, client: null };
        return { user: toAuthUser(data.user), client };
      } catch {
        return { user: null, client: null };
      }
    },
  };
}

export interface BearerReaderDeps {
  getUser: (token: string) => Promise<{ user: AuthUser | null }>;
  onError?: (error: unknown) => void;
}

/** The bearer adapter: the public client plus a token argument, not the cookie path. */
export function createBearerIdentityReader(deps: BearerReaderDeps): BearerIdentityReader {
  return {
    async read(authorization) {
      if (!authorization || !authorization.startsWith('Bearer ')) return null;
      const token = authorization.substring(7);
      if (!token) return null;

      try {
        const { user } = await deps.getUser(token);
        if (!user) return null;
        return { id: user.id, email: user.email ?? '' };
      } catch (error) {
        deps.onError?.(error);
        return null;
      }
    },
  };
}

export interface AdminReaderDeps {
  session: SessionIdentityReader;
  /** The `ADMIN_EMAILS` allowlist predicate (ADR-0003), fail-closed. */
  isAdmin: (email: string) => boolean;
  /** Side effect of a successful Admin resolution, e.g. the allowlist mirror sync. */
  onAdmin?: () => Promise<void>;
}

/**
 * The Admin outcome, built on the session identity. Identity and allowlist
 * checks happen before any repository or service call, so a forbidden request
 * never queries data.
 */
export function createAdminIdentityReader(deps: AdminReaderDeps): AdminIdentityReader {
  return {
    async read() {
      const { user, client } = await deps.session.read();
      if (!user) return { kind: 'anonymous' };
      if (!deps.isAdmin(user.email ?? '')) return { kind: 'forbidden' };

      await deps.onAdmin?.();
      return { kind: 'admin', identity: { user, client } };
    },
  };
}

/** The identity module the guards ask. */
export interface IdentityModule {
  /** The current session identity. `user` is null when anonymous. */
  resolveSession(): Promise<ResolvedIdentity>;
  /** The session identity for public routes; skips the client when no cookie. */
  resolveOptional(): Promise<ResolvedIdentity>;
  /** The Admin outcome: anonymous, forbidden, or the Admin identity. */
  resolveAdmin(): Promise<AdminResolution>;
}

export function createIdentityModule(
  session: SessionIdentityReader,
  admin: AdminIdentityReader
): IdentityModule {
  return {
    resolveSession: () => session.read(),
    resolveOptional: () => session.readOptional(),
    resolveAdmin: () => admin.read(),
  };
}
