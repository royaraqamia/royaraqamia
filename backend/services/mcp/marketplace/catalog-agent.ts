import type {
  McpCatalogListRow,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpStaticClientMap } from '@/backend/shared/domain/mcp-static-clients';
import { McpCatalogConnectReasonSchema } from '@/shared/contracts/mcp-catalog';
import {
  MCP_CATALOG_AGENT_ACTOR,
  MCP_CATALOG_AGENT_REQUIRED_CHECKS,
  type McpCatalogAgentAction,
  type McpCatalogAgentCandidate,
} from '@/shared/contracts/mcp-catalog-agent';
import { McpCatalogError, type McpCatalogService } from './catalog-service';

/**
 * The scoped agent's half of the catalogue service (#1293).
 *
 * The deterministic runner measures; this service only refuses to record a
 * publish the evidence does not support. It reuses `adminUpdate` for the store's
 * admission and the event log, so the agent cannot reach a state an admin could
 * not, and the four rules that matter stay in one place:
 *
 * - a publish needs the checks its class requires, all `ok`;
 * - a copy is a transform of the registry text the mirror holds, not a claim;
 * - a mark goes through the same `/brand/...` or https rule as an admin's;
 * - a skip is a category, so the console can count it.
 *
 * It has no verb for a block, a delete, a remote change, or a member's data.
 */

export type McpCatalogAgentFailure =
  'unknown_app' | 'invalid_copy' | 'invalid_checks' | 'not_publishable';

/** A refusal the endpoint turns into a 400 with a machine-readable code. */
export class McpCatalogAgentError extends Error {
  constructor(
    readonly failure: McpCatalogAgentFailure,
    message: string
  ) {
    super(message);
    this.name = 'McpCatalogAgentError';
  }
}

interface CatalogAgentDependencies {
  repository: McpMarketplaceRepository;
  /** The same service the Admin Console writes through. */
  catalog: McpCatalogService;
  /** The reviewed clients a row may already have. */
  staticClients?: McpStaticClientMap;
  /** The callback URI registered with every pre-registered client. */
  redirectUri: string;
  now?: () => Date;
}

export interface McpCatalogAgentService {
  candidates(limit: number): Promise<McpCatalogAgentCandidate[]>;
  act(action: McpCatalogAgentAction): Promise<void>;
}

function connectReason(value: string | null) {
  const parsed = McpCatalogConnectReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toCandidate(
  row: McpCatalogListRow,
  staticClients: McpStaticClientMap,
  redirectUri: string
): McpCatalogAgentCandidate {
  const client = staticClients.get(row.registry_name);
  return {
    registryName: row.registry_name,
    title: row.title,
    description: row.description,
    titleOverride: row.title_override,
    nameAr: row.name_ar,
    descriptionAr: row.description_ar,
    remoteUrl: row.remote_override ?? row.remote_url,
    redirectUri,
    iconUrl: row.icon_override ?? row.probe_icon_url ?? row.registry_icon_url,
    verified: row.verified_at !== null,
    connectable: row.connectable,
    connectableReason: connectReason(row.connectable_reason),
    probedAt: row.probed_at,
    staticClient: client
      ? {
          authorizationEndpoint: client.authorizationEndpoint,
          clientId: client.clientId,
        }
      : null,
  };
}

export function createMcpCatalogAgentService({
  repository,
  catalog,
  staticClients = new Map(),
  redirectUri,
  now = () => new Date(),
}: CatalogAgentDependencies): McpCatalogAgentService {
  async function loadRow(registryName: string) {
    const row = await repository.getCatalogServer(registryName);
    if (!row || row.status === 'deleted') {
      throw new McpCatalogAgentError('unknown_app', 'unknown app');
    }
    return row;
  }

  return {
    async candidates(limit) {
      const rows = await repository.listAgentCandidates(limit);
      return rows.map((row) => toCandidate(row, staticClients, redirectUri));
    },

    async act(action) {
      const actor = MCP_CATALOG_AGENT_ACTOR;

      if (action.action === 'mark') {
        await catalog.adminUpdate(
          { registryName: action.registryName, iconOverride: action.mark },
          { actor, source: action.source }
        );
        return;
      }

      if (action.action === 'copy') {
        const row = await loadRow(action.registryName);
        // The copy claims this text as its source; a mismatch is a made-up
        // description, which is the one thing the agent must never write.
        if (action.source.title !== row.title || action.source.description !== row.description) {
          throw new McpCatalogAgentError(
            'invalid_copy',
            'the copy does not name the registry text it came from'
          );
        }
        if (row.description === null && (action.descriptionAr ?? '') !== '') {
          throw new McpCatalogAgentError(
            'invalid_copy',
            'the registry published no description to translate'
          );
        }

        await catalog.adminUpdate(
          {
            registryName: action.registryName,
            ...(action.titleOverride !== undefined ? { titleOverride: action.titleOverride } : {}),
            ...(action.nameAr !== undefined ? { nameAr: action.nameAr } : {}),
            ...(action.descriptionAr !== undefined ? { descriptionAr: action.descriptionAr } : {}),
          },
          { actor, source: 'registry' }
        );
        return;
      }

      if (action.action === 'verify') {
        const required = MCP_CATALOG_AGENT_REQUIRED_CHECKS[action.class];
        const failed = action.checks.filter((check) => !check.ok);
        const passed = new Set(
          action.checks.filter((check) => check.ok).map((check) => check.name)
        );
        if (failed.length > 0 || !required.every((name) => passed.has(name))) {
          throw new McpCatalogAgentError(
            'invalid_checks',
            `a ${action.class} publish needs ${required.join(', ')} to pass`
          );
        }

        const row = await loadRow(action.registryName);
        if (row.blocked_at !== null) {
          throw new McpCatalogAgentError('not_publishable', 'the row is blocked');
        }

        /*
          The verdict the store's query reads. It is written before the publish
          because `adminUpdate` refuses a first vouch for a row no measurement
          calls connectable - the same rule an admin meets.
        */
        await repository.saveCatalogProbe(action.registryName, {
          connectable: true,
          reason: null,
          probedAt: now().toISOString(),
          iconUrl: row.probe_icon_url,
          iconMime: row.probe_icon_mime,
        });

        try {
          await catalog.adminUpdate(
            { registryName: action.registryName, verified: true },
            {
              actor,
              source: 'machine',
              evidence: { class: action.class, checks: action.checks },
            }
          );
        } catch (error) {
          // The service's refusal is the spec's, not a transport failure: a row
          // with no mark is a skip the runner records, not a 500.
          if (error instanceof McpCatalogError && error.failure === 'no_mark') {
            throw new McpCatalogAgentError('not_publishable', 'the row has no mark');
          }
          throw error;
        }
        return;
      }

      if (action.action === 'withdraw') {
        await catalog.adminUpdate(
          { registryName: action.registryName, verified: false },
          {
            actor,
            source: 'machine',
            evidence: { failedCheck: action.failedCheck, detail: action.detail },
          }
        );
        return;
      }

      await repository.recordCatalogEvent({
        registryName: action.registryName,
        actor,
        action: 'skip',
        source: 'none',
        evidence: { reason: action.reason, detail: action.detail },
      });
    },
  };
}
