import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { hasSessionCookie } from '@/shared/session-cookie';

/**
 * The identity seam.
 *
 * "Who is the current user?" has exactly one owner: this module. It owns the
 * session-cookie rule, the client construction and the difference between
 * "no session", "a session" and "a session that is not an Admin". The page
 * guard, the optional-user reader, the cached session verifier, the Admin
 * adapter and the bearer reader are callers, not resolvers.
 *
 * The readers are injected, so the module is testable without a live session and
 * the bearer path is a declared adapter at the same seam rather than an
 * accidental copy of the cookie path.
 */

export interface AuthUser {
  id: string;
  email?: string;
}

/** A session resolution. `read()` always builds a client; the user may be null. */
export interface SessionResolution {
  user: AuthUser | null;
  client: SupabaseClient<Database>;
}

/** An optional resolution: no cookie means no client is built at all. */
export interface OptionalResolution {
  user: AuthUser | null;
  client: SupabaseClient<Database> | null;
}

/** Reads the session-cookie identity. `readOptional` never throws. */
export interface SessionIdentityReader {
  read(): Promise<SessionResolution>;
  readOptional(): Promise<OptionalResolution>;
}

/** Reads a bearer-token identity. */
export interface BearerIdentityReader {
  read(authorization: string | null): Promise<AuthUser | null>;
}

/**
 * Reads a bearer token into the same shape as a cookie session: the user plus a
 * client that carries the caller's token. `null` means the token was absent or
 * rejected; it never throws.
 */
export interface TokenSessionReader {
  read(authorization: string | null): Promise<SessionResolution | null>;
}

/**
 * The three outcomes the guards need. `anonymous` and `forbidden` are distinct
 * so an Admin policy can answer 401 versus 403 without inspecting a message.
 */
export type AdminResolution =
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'admin'; identity: { user: AuthUser; client: SupabaseClient<Database> } };

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

/** The token a `Bearer` header names, or null when the header is another shape. */
function bearerToken(authorization: string | null): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.substring(7);
  return token.length > 0 ? token : null;
}

/**
 * The bearer adapter: the public client plus a token argument, not the cookie
 * path. Its contract always yields an email string, so an absent one is `''`.
 */
export function createBearerIdentityReader(deps: BearerReaderDeps): BearerIdentityReader {
  return {
    async read(authorization) {
      const token = bearerToken(authorization);
      if (!token) return null;

      try {
        const { user } = await deps.getUser(token);
        return toAuthUser(user);
      } catch (error) {
        deps.onError?.(error);
        return null;
      }
    },
  };
}

export interface TokenSessionReaderDeps {
  /** Validates the token; the same reader the user-only adapter uses. */
  getUser: (token: string) => Promise<{ user: AuthUser | null }>;
  /** Builds a client whose requests carry this token, not the deployment's. */
  createClient: (token: string) => SupabaseClient<Database>;
  onError?: (error: unknown) => void;
}

/**
 * The token-scoped session adapter.
 *
 * A header is not a credential: the route has to act as the token's user, and
 * a client built from cookies would quietly resolve someone else (or nobody).
 * The token is validated first, so a client is only ever built for a live
 * identity.
 */
export function createTokenSessionReader(deps: TokenSessionReaderDeps): TokenSessionReader {
  return {
    async read(authorization) {
      const token = bearerToken(authorization);
      if (!token) return null;

      try {
        const { user } = await deps.getUser(token);
        const authUser = toAuthUser(user);
        if (!authUser) return null;
        return { user: authUser, client: deps.createClient(token) };
      } catch (error) {
        deps.onError?.(error);
        return null;
      }
    },
  };
}

export interface RequestIdentityReaderDeps {
  /** The request's `Authorization` header, or null when there is no request. */
  authorization: () => Promise<string | null>;
  session: SessionIdentityReader;
  token: TokenSessionReader;
  /**
   * The client an unauthenticated resolution carries. It is never used: every
   * caller checks the user first, and the RLS it runs under is the anonymous
   * one rather than a cookie jar that could name somebody else.
   */
  anonymousClient: () => SupabaseClient<Database>;
}

function isBearer(authorization: string | null): boolean {
  return Boolean(authorization && authorization.startsWith('Bearer '));
}

/**
 * The request-aware reader: a Bearer token when one was sent, else the cookie.
 *
 * A Bearer header is authoritative, including when its token is rejected. The
 * app has no jar to fall back to, and an expired token must not let whatever
 * cookies a native HTTP stack happens to hold answer for another identity —
 * the boundary ADR-0088 draws. A request with no Bearer header follows the
 * cookie path exactly as before, and a non-Bearer scheme is not a token either.
 *
 * The authorization lookup is guarded because some callers run outside a
 * request (a build-time render, a unit test) and there is simply no header
 * there.
 */
export function createRequestIdentityReader(
  deps: RequestIdentityReaderDeps
): SessionIdentityReader {
  async function requestAuthorization(): Promise<string | null> {
    try {
      return await deps.authorization();
    } catch {
      return null;
    }
  }

  return {
    async read() {
      const authorization = await requestAuthorization();
      if (isBearer(authorization)) {
        const bearer = await deps.token.read(authorization);
        return bearer ?? { user: null, client: deps.anonymousClient() };
      }
      return deps.session.read();
    },

    async readOptional() {
      try {
        const authorization = await requestAuthorization();
        if (isBearer(authorization)) {
          return (await deps.token.read(authorization)) ?? { user: null, client: null };
        }
      } catch {
        // A token that cannot be read is not a session; answer anonymously.
      }
      return deps.session.readOptional();
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
  resolveSession(): Promise<SessionResolution>;
  /** The session identity for public routes; skips the client when no cookie. */
  resolveOptional(): Promise<OptionalResolution>;
  /** The identity behind an `Authorization: Bearer` header, or null. */
  resolveBearer(authorization: string | null): Promise<AuthUser | null>;
  /** The Admin outcome: anonymous, forbidden, or the Admin identity. */
  resolveAdmin(): Promise<AdminResolution>;
}

/**
 * `request` is the Bearer-or-cookie reader the request-scoped guards use; the
 * bare `session` reader stays the cookie-only fallback for callers that do not
 * have a request (and for tests that only exercise the cookie path).
 */
export function createIdentityModule(
  session: SessionIdentityReader,
  bearer: BearerIdentityReader,
  admin: AdminIdentityReader,
  request: SessionIdentityReader = session
): IdentityModule {
  return {
    resolveSession: () => request.read(),
    resolveOptional: () => request.readOptional(),
    resolveBearer: (authorization) => bearer.read(authorization),
    resolveAdmin: () => admin.read(),
  };
}
