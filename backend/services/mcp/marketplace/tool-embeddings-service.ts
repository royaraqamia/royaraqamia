import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import type {
  McpMarketplaceRepository,
  McpToolInput,
} from '@/backend/repositories/mcp/marketplace-repository';
import {
  APP_TOOL_EMBEDDING,
  appToolEmbeddingHash,
  appToolEmbeddingText,
} from '@/backend/shared/domain/app-tool-embeddings';
import { logger } from '@/backend/shared/logger';

/**
 * Writes the vectors the router ranks with (#1917, ADR-0223).
 *
 * Embedding happens when the tools are read — a connect, a re-link, or the
 * backfill — and never on a turn's read path (ADR-0185 decision 5). The turn
 * reads similarities from `mcp_tool_nearest_1024`, which costs a few bytes a
 * tool instead of a float per dimension.
 *
 * **It never fails a connect.** No provider, a refused request, a provider that
 * hangs past the budget: the tools stay stored and the router answers on
 * vocabulary alone, which is the day-one path too — a member who connects and
 * immediately asks sees the words work before the vectors exist.
 *
 * Only the tools whose text moved are embedded: the stored hash says which ones
 * those are, so a re-sync of 285 unchanged tools spends nothing.
 */
export interface McpToolEmbeddingService {
  /** Embeds and stores the tools whose text the store does not already hold. */
  embedConnection(input: {
    connectionId: string;
    appName: string;
    tools: McpToolInput[];
  }): Promise<number>;
}

interface EmbeddingDependencies {
  repository: McpMarketplaceRepository;
  /** Absent is a deployment with no embedding provider: connect still works. */
  embeddings: AiEmbeddingsClient | null;
  /** The whole write's budget. Past it the router stays lexical. */
  budgetMs?: number;
}

/** A connect already waited on the partial consent and `tools/list`. */
export const TOOL_EMBEDDING_BUDGET_MS = 20_000;

export function createMcpToolEmbeddingService({
  repository,
  embeddings,
  budgetMs = TOOL_EMBEDDING_BUDGET_MS,
}: EmbeddingDependencies): McpToolEmbeddingService {
  return {
    async embedConnection({ connectionId, appName, tools }) {
      if (!embeddings || tools.length === 0) return 0;
      if (embeddings.dimensions !== APP_TOOL_EMBEDDING.dimensions) return 0;

      try {
        const stored = await repository.listToolEmbeddingHashes(connectionId);
        const held = new Map(stored.map((row) => [row.tool_name, row] as const));

        const stale = tools
          .map((tool) => {
            const text = appToolEmbeddingText({
              appName,
              toolName: tool.name,
              description: tool.description,
            });
            return {
              tool,
              text,
              hash: appToolEmbeddingHash(embeddings.model, text),
            };
          })
          .filter((entry) => {
            const row = held.get(entry.tool.name);
            return !row || row.source_hash !== entry.hash || row.model !== embeddings.model;
          });

        if (stale.length === 0) return 0;

        const vectors = await embeddings.embed(
          stale.map((entry) => entry.text),
          AbortSignal.timeout(budgetMs)
        );
        if (!vectors || vectors.length !== stale.length) {
          logger.warn('MCP tool vectors were not written; the router stays on vocabulary', {
            connectionId,
            tools: stale.length,
          });
          return 0;
        }

        await repository.saveToolEmbeddings(
          stale.flatMap((entry, index) => {
            const embedding = vectors[index];
            if (!embedding) return [];
            return [
              {
                connectionId,
                toolName: entry.tool.name,
                model: embeddings.model,
                sourceHash: entry.hash,
                embedding,
              },
            ];
          })
        );
        return stale.length;
      } catch (error) {
        // The member's connection is not the provider's problem.
        logger.warn('MCP tool vectors were not written; the router stays on vocabulary', {
          connectionId,
          error: String(error),
        });
        return 0;
      }
    },
  };
}
