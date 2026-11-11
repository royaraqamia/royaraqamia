import type { McpIcon, McpIconClient } from '@/backend/clients/mcp-icon';
import type { McpMarketplaceRepository } from '@/backend/repositories/mcp/marketplace-repository';

/**
 * The store's brand marks, resolved against the row rather than the request.
 *
 * The caller names a catalogue row; the URL is whatever that row stored when it
 * was probed. A name the store does not show — unverified, blocked, retired —
 * answers nothing, so the proxy cannot be used as a general door to a third
 * party's server.
 */

export interface McpIconService {
  get(registryName: string): Promise<McpIcon | null>;
}

interface IconServiceDependencies {
  repository: McpMarketplaceRepository;
  icons: McpIconClient;
}

export function createMcpIconService({
  repository,
  icons,
}: IconServiceDependencies): McpIconService {
  return {
    async get(registryName) {
      if (registryName.length === 0 || registryName.length > 200) return null;

      const server = await repository.getCatalogServer(registryName);
      if (
        !server ||
        server.status !== 'active' ||
        server.blocked_at !== null ||
        server.verified_at === null ||
        !server.icon_url
      ) {
        return null;
      }

      return icons.fetch(server.icon_url);
    },
  };
}
