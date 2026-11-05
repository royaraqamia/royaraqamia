import { createMcpOAuthRepository } from '@/backend/repositories/mcp/mcp-oauth-repository';
import { resolveMcpContext, type McpUserContext } from '@/backend/services/mcp/session';

/**
 * The data plane's wiring.
 *
 * `resolveMcpContext` re-reads the token row on every request and does not build
 * the store it reads, because a service may not import a repository by value
 * (`layers/no-cross-layer-import`). It is wired here rather than in `mcp.ts` so
 * the OAuth surface's provider — and the token crypto it imports — stays out of
 * the data plane's module graph.
 */
export function resolveDefaultMcpContext(
  bearerToken: string | null | undefined
): Promise<McpUserContext | null> {
  return resolveMcpContext(bearerToken, createMcpOAuthRepository());
}
