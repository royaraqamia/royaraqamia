import { describe, expect, it, vi } from 'vitest';

import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import type {
  McpMarketplaceRepository,
  McpToolEmbeddingWrite,
  McpToolInput,
} from '@/backend/repositories/mcp/marketplace-repository';
import { createMcpToolEmbeddingService } from '@/backend/services/mcp/marketplace/tool-embeddings-service';
import {
  APP_TOOL_EMBEDDING,
  appToolEmbeddingHash,
  appToolEmbeddingText,
} from '@/backend/shared/domain/app-tool-embeddings';

/**
 * The vectors the router ranks by, written at connect time (#1917, ADR-0223).
 *
 * What these pin is what the member would feel if it broke: a connect still
 * succeeds with no provider and with a provider that refuses, a re-sync of
 * unchanged tools spends nothing, and the text that is embedded is the text the
 * fixture pinned — a description the server rewrote is re-embedded rather than
 * ranked by an old meaning.
 */

const TOOLS: McpToolInput[] = [
  {
    name: 'create_deployment',
    description: 'Create a deployment.',
    inputSchema: {},
    readOnly: false,
  },
  { name: 'list_projects', description: 'List projects.', inputSchema: {}, readOnly: true },
];

function textOf(tool: McpToolInput): string {
  return appToolEmbeddingText({
    appName: 'Vercel',
    toolName: tool.name,
    description: tool.description,
  });
}

function client(overrides: Partial<AiEmbeddingsClient> = {}): AiEmbeddingsClient {
  return {
    model: 'test-model',
    dimensions: APP_TOOL_EMBEDDING.dimensions,
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => Array.from({ length: APP_TOOL_EMBEDDING.dimensions }, () => 0.1))
    ),
    ...overrides,
  };
}

function repository(held: Array<{ tool_name: string; model: string; source_hash: string }> = []) {
  const written: McpToolEmbeddingWrite[][] = [];
  const fake = {
    listToolEmbeddingHashes: vi.fn(async () => held),
    saveToolEmbeddings: vi.fn(async (rows: McpToolEmbeddingWrite[]) => {
      written.push(rows);
      return rows.length;
    }),
  } as unknown as McpMarketplaceRepository;

  return { repository: fake, written };
}

describe('the tool vectors the connect flow writes', () => {
  it('embeds every tool of a new connection, with the app and the tool’s own words', async () => {
    const embeddings = client();
    const { repository: repo, written } = repository();

    const service = createMcpToolEmbeddingService({ repository: repo, embeddings });
    await expect(
      service.embedConnection({ connectionId: 'conn-1', appName: 'Vercel', tools: TOOLS })
    ).resolves.toBe(2);

    expect(embeddings.embed).toHaveBeenCalledWith(
      [textOf(TOOLS[0] as McpToolInput), textOf(TOOLS[1] as McpToolInput)],
      expect.anything()
    );
    expect(written[0]?.map((row) => row.toolName)).toEqual(['create_deployment', 'list_projects']);
    expect(written[0]?.[0]?.sourceHash).toBe(
      appToolEmbeddingHash('test-model', textOf(TOOLS[0] as McpToolInput))
    );
  });

  it('re-embeds only the tool whose text moved, so a re-sync of 285 costs nothing', async () => {
    const embeddings = client();
    const unchanged = TOOLS[1] as McpToolInput;
    const { repository: repo, written } = repository([
      {
        tool_name: unchanged.name,
        model: 'test-model',
        source_hash: appToolEmbeddingHash('test-model', textOf(unchanged)),
      },
    ]);

    const service = createMcpToolEmbeddingService({ repository: repo, embeddings });
    await service.embedConnection({ connectionId: 'conn-1', appName: 'Vercel', tools: TOOLS });

    expect(embeddings.embed).toHaveBeenCalledWith(
      [textOf(TOOLS[0] as McpToolInput)],
      expect.anything()
    );
    expect(written[0]?.map((row) => row.toolName)).toEqual(['create_deployment']);
  });

  it('re-embeds a connection whose vectors came from another model', async () => {
    const embeddings = client();
    const { repository: repo, written } = repository(
      TOOLS.map((tool) => ({
        tool_name: tool.name,
        model: 'older-model',
        source_hash: appToolEmbeddingHash('older-model', textOf(tool)),
      }))
    );

    const service = createMcpToolEmbeddingService({ repository: repo, embeddings });
    await service.embedConnection({ connectionId: 'conn-1', appName: 'Vercel', tools: TOOLS });

    expect(written[0]).toHaveLength(2);
  });

  it('does nothing at all when the deployment has no embedding provider', async () => {
    const { repository: repo, written } = repository();
    const service = createMcpToolEmbeddingService({ repository: repo, embeddings: null });

    await expect(
      service.embedConnection({ connectionId: 'conn-1', appName: 'Vercel', tools: TOOLS })
    ).resolves.toBe(0);
    expect(written).toEqual([]);
  });

  it('never fails a connect when the provider refuses', async () => {
    const embeddings = client({ embed: vi.fn(async () => null) });
    const { repository: repo, written } = repository();
    const service = createMcpToolEmbeddingService({ repository: repo, embeddings });

    await expect(
      service.embedConnection({ connectionId: 'conn-1', appName: 'Vercel', tools: TOOLS })
    ).resolves.toBe(0);
    expect(written).toEqual([]);
  });

  it('writes nothing when the provider answers a width the table cannot hold', async () => {
    const embeddings = client({ dimensions: 1536 });
    const { repository: repo, written } = repository();
    const service = createMcpToolEmbeddingService({ repository: repo, embeddings });

    await expect(
      service.embedConnection({ connectionId: 'conn-1', appName: 'Vercel', tools: TOOLS })
    ).resolves.toBe(0);
    expect(written).toEqual([]);
  });
});
