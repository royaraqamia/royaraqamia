import { createMcpOAuthRepository } from '@/backend/repositories/mcp/mcp-oauth-repository';
import { createMcpMarketplaceRepository } from '@/backend/repositories/mcp/marketplace-repository';
import { createMcpRemoteClient } from '@/backend/clients/mcp-remote';
import { createMcpRegistryClient } from '@/backend/clients/mcp-registry';
import { createMcpIconClient } from '@/backend/clients/mcp-icon';
import { readMcpStaticClients } from '@/backend/config/mcp-static-clients';
import {
  createMcpCatalogService,
  type McpCatalogService,
} from '@/backend/services/mcp/marketplace/catalog-service';
import {
  createMcpConnectionService,
  type McpConnectionService,
} from '@/backend/services/mcp/marketplace/connections-service';
import {
  createMcpConnectService,
  type McpConnectService,
} from '@/backend/services/mcp/marketplace/connect-service';
import {
  createMcpIconService,
  type McpIconService,
} from '@/backend/services/mcp/marketplace/icon-service';
import {
  createMcpAccessTokenService,
  type McpAccessTokenService,
} from '@/backend/services/mcp/marketplace/access-token-service';
import {
  createMcpAppToolsService,
  type McpAppToolsService,
} from '@/backend/services/mcp/marketplace/app-tools-service';
import {
  createMcpToolEmbeddingService,
  type McpToolEmbeddingService,
} from '@/backend/services/mcp/marketplace/tool-embeddings-service';
import {
  createMcpConnectedAppService,
  type McpConnectedAppService,
} from '@/backend/services/mcp/connected-apps';
import {
  createMcpOAuthProvider,
  type McpOAuthProvider,
} from '@/backend/services/mcp/oauth-provider';
import {
  createMcpCatalogAgentService,
  type McpCatalogAgentService,
} from '@/backend/services/mcp/marketplace/catalog-agent';
import { createAiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { APP_TOOL_EMBEDDING } from '@/backend/shared/domain/app-tool-embeddings';
import { env } from '@/backend/config/env';

/**
 * Composition root for the public MCP server's OAuth surface and the outbound
 * marketplace (ADR-0155).
 *
 * The provider owns one token store and does not build it: a service may not
 * import a repository by value (`layers/no-cross-layer-import`), so the wiring
 * happens here and `app/mcp/*` asks for the result.
 */
export function createDefaultMcpOAuthProvider(): McpOAuthProvider {
  return createMcpOAuthProvider({ repo: createMcpOAuthRepository() });
}

export function createDefaultMcpConnectedAppService(): McpConnectedAppService {
  return createMcpConnectedAppService({ provider: createDefaultMcpOAuthProvider() });
}

/**
 * The one redirect URI every provider registers, from our own origin (ADR-0155).
 *
 * The start controller and the assistant's store tools both need it, and neither
 * may take one from a request: a callback is ours, not the caller's Host.
 */
export function mcpCallbackUrl(): string {
  return new URL('/mcp/callback', env.origin).toString();
}

/**
 * The unattended run's scoped door (#1293). It is the same catalogue service an
 * admin writes through, plus the four rules that keep a publish measured; the
 * redirect URI is ours, so a pre-registered client is probed against the one
 * the provider already has on file.
 */
export function createDefaultMcpCatalogAgentService(): McpCatalogAgentService {
  return createMcpCatalogAgentService({
    repository: createMcpMarketplaceRepository(),
    catalog: createDefaultMcpCatalogService(),
    staticClients: readMcpStaticClients(),
    redirectUri: mcpCallbackUrl(),
  });
}

/**
 * The outbound direction: نور reaching a third party's MCP server. The remote
 * client is the only thing here that opens a socket, and it is the one that
 * carries `backend/shared/egress` into every call.
 */
export function createDefaultMcpConnectService(): McpConnectService {
  return createMcpConnectService({
    repository: createMcpMarketplaceRepository(),
    remote: createMcpRemoteClient(),
    staticClients: readMcpStaticClients(),
    // What the router ranks by (#1917). A deployment with no provider builds no
    // client, and the connect flow simply writes no vectors.
    embeddings: createDefaultMcpToolEmbeddingService(),
  });
}

/**
 * The tool vectors the router reads (#1917, ADR-0223).
 *
 * It shares the embedding client with the assistant and is wired only here, so
 * the connect flow, the backfill and the turn's query vector all come from one
 * model — two models' vectors are not comparable.
 */
export function createDefaultMcpToolEmbeddingService(): McpToolEmbeddingService {
  return createMcpToolEmbeddingService({
    repository: createMcpMarketplaceRepository(),
    embeddings: createAiEmbeddingsClient({ dimensions: APP_TOOL_EMBEDDING.dimensions }),
  });
}

/**
 * The catalogue: the registry mirror, the search over it, and the takedown
 * switch (phase 2 / #1223). Two outbound clients meet here — the registry the
 * mirror reads, and the third-party servers a probe measures — and both carry
 * `backend/shared/egress` into every call.
 */
export function createDefaultMcpCatalogService(): McpCatalogService {
  return createMcpCatalogService({
    repository: createMcpMarketplaceRepository(),
    registry: createMcpRegistryClient(),
    remote: createMcpRemoteClient(),
    staticClients: readMcpStaticClients(),
  });
}

/**
 * The store's brand marks: one stored URL per verified row, fetched through the
 * same egress policy as every other third party, never by the member's browser.
 */
export function createDefaultMcpIconService(): McpIconService {
  return createMcpIconService({
    repository: createMcpMarketplaceRepository(),
    icons: createMcpIconClient(),
  });
}

/**
 * The member's own connections (phase 3 / #1224): the outbound list, the
 * post-connect detail, the switches, and the disconnect.
 *
 * It shares the marketplace repository and the remote client with the connect
 * flow, so the row a member sees is the row the flow wrote, and the provider
 * revocation on a disconnect is the same egress-guarded client.
 */
export function createDefaultMcpConnectionService(): McpConnectionService {
  return createMcpConnectionService({
    repository: createMcpMarketplaceRepository(),
    remote: createMcpRemoteClient(),
  });
}

/**
 * The token a remote call spends, refreshed before it expires (#1227).
 *
 * One service rather than a function on the remote client, because the claim
 * that stops two callers spending one refresh token is a database write: the
 * client opens sockets and knows nothing about a member.
 */
export function createDefaultMcpAccessTokenService(): McpAccessTokenService {
  return createMcpAccessTokenService({
    repository: createMcpMarketplaceRepository(),
    remote: createMcpRemoteClient(),
  });
}

/**
 * The apps' tools as the assistant may use them (phase 4 / #1225): the flat
 * catalog a turn plans from, one call as the member, and the display names a
 * proposal card resolves.
 *
 * It shares the repository and the remote client with the connect flow, so the
 * row the assistant calls is the row the member connected.
 */
export function createDefaultMcpAppToolsService(): McpAppToolsService {
  return createMcpAppToolsService({
    repository: createMcpMarketplaceRepository(),
    remote: createMcpRemoteClient(),
    tokens: createDefaultMcpAccessTokenService(),
  });
}
