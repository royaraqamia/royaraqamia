import { createMcpOAuthRepository } from '@/backend/repositories/mcp/mcp-oauth-repository';
import { createMcpMarketplaceRepository } from '@/backend/repositories/mcp/marketplace-repository';
import { createMcpRemoteClient } from '@/backend/clients/mcp-remote';
import { createMcpRegistryClient } from '@/backend/clients/mcp-registry';
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
  createMcpConnectedAppService,
  type McpConnectedAppService,
} from '@/backend/services/mcp/connected-apps';
import {
  createMcpOAuthProvider,
  type McpOAuthProvider,
} from '@/backend/services/mcp/oauth-provider';

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
 * The outbound direction: نور reaching a third party's MCP server. The remote
 * client is the only thing here that opens a socket, and it is the one that
 * carries `backend/shared/egress` into every call.
 */
export function createDefaultMcpConnectService(): McpConnectService {
  return createMcpConnectService({
    repository: createMcpMarketplaceRepository(),
    remote: createMcpRemoteClient(),
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
