import { z } from 'zod';

import { createGuardedFetch, readCappedText } from '@/backend/shared/egress';

/**
 * The registry mirror's only socket (ADR-0155, phase 2 / #1223).
 *
 * `registry.modelcontextprotocol.io` is the official catalogue of MCP servers.
 * The marketplace never asks it a question at request time — an outage there is
 * a stale catalogue, not an empty screen — so this client is called by the sync
 * service and by nothing else.
 *
 * It still goes through `backend/shared/egress`, for the timeout and the size
 * cap rather than for the SSRF rules: the host is ours to trust, but a preview
 * API that answers 400 MB is a function that never returns. The address is
 * constant, so nothing user-entered reaches this module.
 *
 * The registry is preview and its shape may change, so every entry is validated
 * one at a time: a row we cannot read is a row we skip, not a page we lose.
 */

const REGISTRY_ENDPOINT = 'https://registry.modelcontextprotocol.io/v0/servers';

/** The registry's own ceiling; 100 is its maximum and its default is 30. */
const PAGE_LIMIT = 100;

const RemoteSchema = z.object({
  type: z.string(),
  url: z.string(),
});

const ServerSchema = z.object({
  name: z.string().min(1),
  title: z.string().nullish(),
  description: z.string().nullish(),
  version: z.string().nullish(),
  remotes: z.array(RemoteSchema).nullish(),
});

const OfficialMetaSchema = z.object({
  status: z.string().nullish(),
  publishedAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  isLatest: z.boolean().nullish(),
});

const EntrySchema = z.object({
  server: ServerSchema,
  _meta: z
    .object({ 'io.modelcontextprotocol.registry/official': OfficialMetaSchema.nullish() })
    .nullish(),
});

const PageSchema = z.object({
  servers: z.array(z.unknown()),
  metadata: z.object({ nextCursor: z.string().nullish() }).nullish(),
});

/** One registry row, as the wire spells it. Policy is the service's job. */
export interface McpRegistryEntry {
  registryName: string;
  title: string | null;
  description: string | null;
  version: string | null;
  remotes: Array<{ type: string; url: string }>;
  /** `active`, `deprecated` or `deleted`, from the registry's own metadata. */
  status: string;
  publishedAt: string | null;
  registryUpdatedAt: string | null;
  raw: unknown;
}

export interface McpRegistryPage {
  entries: McpRegistryEntry[];
  /** `null` is the last page. */
  nextCursor: string | null;
  /** Entries this page carried that we could not read. */
  skipped: number;
}

export interface McpRegistryClient {
  /**
   * One page of the catalogue.
   *
   * `version=latest` is the registry's own dedupe: without it the API returns
   * every published version of every server, and the mirror would keep whichever
   * one happened to be written last.
   *
   * `updatedSince` is the incremental path, and it is the only one that reports
   * a server the registry removed: the API includes deleted rows whenever
   * `updated_since` is set.
   */
  listPage(input?: {
    cursor?: string | null;
    updatedSince?: string | null;
  }): Promise<McpRegistryPage>;
}

interface RegistryDependencies {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<Array<{ address: string }>>;
}

export function createMcpRegistryClient(
  dependencies: RegistryDependencies = {}
): McpRegistryClient {
  const guardedFetch = createGuardedFetch({
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.resolveHost ? { resolveHost: dependencies.resolveHost } : {}),
  });

  return {
    async listPage({ cursor = null, updatedSince = null } = {}) {
      const url = new URL(REGISTRY_ENDPOINT);
      url.searchParams.set('limit', String(PAGE_LIMIT));
      url.searchParams.set('version', 'latest');
      if (updatedSince) url.searchParams.set('updated_since', updatedSince);
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await guardedFetch(url, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`the MCP registry answered ${response.status}`);
      }

      const body = PageSchema.safeParse(JSON.parse(await readCappedText(response)));
      if (!body.success) {
        throw new Error('the MCP registry answered a shape this client does not read');
      }

      const entries: McpRegistryEntry[] = [];
      let skipped = 0;

      for (const raw of body.data.servers) {
        const parsed = EntrySchema.safeParse(raw);
        if (!parsed.success) {
          skipped += 1;
          continue;
        }

        const { server } = parsed.data;
        const meta = parsed.data._meta?.['io.modelcontextprotocol.registry/official'];
        // A superseded version is not the catalogue's row. The filter above asks
        // for latest only; this keeps a filter the API ignored from becoming a
        // silent overwrite.
        if (meta?.isLatest === false) continue;

        entries.push({
          registryName: server.name,
          title: server.title ?? null,
          description: server.description ?? null,
          version: server.version ?? null,
          remotes: (server.remotes ?? []).map((remote) => ({
            type: remote.type,
            url: remote.url,
          })),
          status: meta?.status ?? 'active',
          publishedAt: meta?.publishedAt ?? null,
          registryUpdatedAt: meta?.updatedAt ?? null,
          raw,
        });
      }

      return { entries, nextCursor: body.data.metadata?.nextCursor ?? null, skipped };
    },
  };
}
