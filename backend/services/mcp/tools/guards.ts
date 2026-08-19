import type { McpUserContext } from '../session';
import type { McpScope } from '../scope';

/**
 * Guards for MCP tools. Every tool checks its required scope(s) against the
 * request context BEFORE touching any data, so a caller that lacks the scope
 * gets a clear, consistent error instead of a confusing database failure.
 *
 * Because tools run on the user-scoped Supabase client, RLS is enforced at the
 * database layer too — this guard is the first line, RLS is the second.
 */

export class MissingScopeError extends Error {
  constructor(required: McpScope[]) {
    const scopeList = required.join(', ');
    super(
      `This tool requires the scope: ${scopeList}. Re-connect with the needed scope to use it.`
    );
    this.name = 'MissingScopeError';
  }
}

/** Throw MissingScopeError unless the context grants at least one of the scopes. */
export function requireAnyScope(ctx: McpUserContext, required: McpScope[]): void {
  const granted = required.some((scope) => ctx.scopes.includes(scope));
  if (!granted) throw new MissingScopeError(required);
}

/** Throw MissingScopeError unless the context grants every one of the scopes. */
export function requireAllScopes(ctx: McpUserContext, required: McpScope[]): void {
  const missing = required.filter((scope) => !ctx.scopes.includes(scope));
  if (missing.length > 0) throw new MissingScopeError(missing);
}

/** Throw an error when the caller is not authenticated (no user id). */
export function requireUserId(ctx: McpUserContext, label: string): string {
  if (!ctx.userId) {
    throw new Error(`${label} requires an authenticated session.`);
  }
  return ctx.userId;
}
