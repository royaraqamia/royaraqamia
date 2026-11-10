import type {
  McpCatalogAddressRecord,
  McpCatalogListRow,
  McpCatalogUpsertRow,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpRegistryClient, McpRegistryEntry } from '@/backend/clients/mcp-registry';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import { assertEgressUrl, EgressBlockedError } from '@/backend/shared/egress';
import { logger } from '@/backend/shared/logger';
import {
  MCP_CATALOG_PAGE_SIZE,
  McpCatalogConnectReasonSchema,
  type McpCatalogAdminPage,
  type McpCatalogAdminRow,
  type McpCatalogAdminUpdate,
  type McpCatalogConnectReason,
  type McpCatalogPage,
  type McpCatalogRow,
} from '@/shared/contracts/mcp-catalog';

/**
 * The catalogue: the mirror of the official MCP registry, the search over it, the
 * takedown switch, and the verdict about whether a row can be connected
 * (ADR-0155, phase 2 / #1223).
 *
 * Three decisions worth stating, all of them recorded in
 * `docs/specs/mcp-marketplace.md`:
 *
 * - **The mirror is a resumable pass, not one request.** The registry answers
 *   `?version=latest` with tens of thousands of rows at 100 a page, which does
 *   not fit in one serverless invocation. A run pages until its own deadline,
 *   saves the cursor, and the next run continues. A pass only marks rows
 *   `deleted` when it reaches the end *and* saw enough rows to be a registry
 *   rather than an outage.
 * - **The verdict is demand-driven.** Probing the whole catalogue to answer a
 *   question about twenty visible rows is the wrong bill, so the rows a screen
 *   draws are the rows probed, cached for a week. `null` is a third state: "not
 *   measured yet", never a silent "no".
 * - **A takedown is never a delete.** `blocked_at` is what the connect flow
 *   refuses on; the row stays for the member who is already connected to it.
 */

/** How long a run may spend before it must return; `maxDuration` is 60s. */
const SYNC_BUDGET_MS = 35_000;

/**
 * Fewer rows than this at the end of a pass is a registry outage, not an empty
 * registry, and nothing may be marked deleted on the strength of it.
 */
const MIN_PASS_ROWS = 100;

/** An incremental run re-reads an hour before its baseline, to survive a clock. */
const INCREMENTAL_OVERLAP_MS = 60 * 60 * 1000;

/** How long a verdict stands before a row is due another look. */
const PROBE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Probes one search may enqueue; each is up to 4s, run after the response. */
const MAX_PROBES_PER_REQUEST = 5;

const REGISTRY_STATUSES = new Set(['active', 'deprecated', 'deleted']);

export type McpCatalogSyncMode = 'pass' | 'incremental';

export interface McpCatalogSyncResult {
  mode: McpCatalogSyncMode;
  pages: number;
  rows: number;
  /** Rows this page batch could not be read, or had no usable address. */
  skipped: number;
  deleted: number;
  /** True when this run reached the end of the registry. */
  completed: boolean;
  error: string | null;
}

export interface McpCatalogService {
  search(input: { q: string; cursor: string | null }): Promise<McpCatalogPage>;
  adminList(input: { q: string; cursor: string | null }): Promise<McpCatalogAdminPage>;
  adminUpdate(input: McpCatalogAdminUpdate): Promise<void>;
  sync(input?: { budgetMs?: number }): Promise<McpCatalogSyncResult>;
  /**
   * Measures the verdict for rows a screen just drew, and returns how many were
   * due. Called after the response, never inside it.
   */
  probe(registryNames: string[]): Promise<number>;
}

interface CatalogServiceDependencies {
  repository: McpMarketplaceRepository;
  registry: McpRegistryClient;
  remote: McpRemoteClient;
  now?: () => Date;
}

function connectReason(value: string | null): McpCatalogConnectReason | null {
  const parsed = McpCatalogConnectReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The member's row: the Arabic description when it exists, the registry's until then. */
function toMemberRow(row: McpCatalogListRow): McpCatalogRow {
  return {
    registryName: row.registry_name,
    title: row.title,
    description: row.description_ar ?? row.description,
    nameAr: row.name_ar,
    connectable: row.connectable,
    connectableReason: connectReason(row.connectable_reason),
    publishedAt: row.published_at,
  };
}

function toAdminRow(row: McpCatalogListRow): McpCatalogAdminRow {
  return {
    ...toMemberRow(row),
    descriptionAr: row.description_ar,
    remoteUrl: row.remote_url,
    status: row.status,
    version: row.version,
    blocked: row.blocked_at !== null,
    blockedReason: row.blocked_reason,
    probedAt: row.probed_at,
    fetchedAt: row.fetched_at,
  };
}

/**
 * One registry entry as the mirror keeps it, or the reason to skip it.
 *
 * Remote-only (ADR-0155, decision 5): a `remotes[]` entry of type
 * `streamable-http` on an address the egress policy would accept. A package
 * server is stdio and cannot run here; a private host is dropped at ingest and
 * again at connect.
 */
function toUpsertRow(entry: McpRegistryEntry): McpCatalogUpsertRow | null {
  const remote = entry.remotes.find((candidate) => {
    if (candidate.type !== 'streamable-http') return false;
    try {
      assertEgressUrl(candidate.url);
      return true;
    } catch (error) {
      if (error instanceof EgressBlockedError) return false;
      throw error;
    }
  });

  const status = REGISTRY_STATUSES.has(entry.status)
    ? (entry.status as McpCatalogUpsertRow['status'])
    : 'active';

  // A retired row still has to keep its address: the column is not nullable and
  // a live connection points at it.
  if (!remote) return null;

  return {
    registryName: entry.registryName,
    title: entry.title,
    description: entry.description,
    version: entry.version,
    remoteUrl: remote.url,
    status,
    publishedAt: entry.publishedAt,
    registryUpdatedAt: entry.registryUpdatedAt,
    raw: entry.raw as McpCatalogUpsertRow['raw'],
  };
}

export function createMcpCatalogService({
  repository,
  registry,
  remote,
  now = () => new Date(),
}: CatalogServiceDependencies): McpCatalogService {
  async function search({
    q,
    cursor,
  }: {
    q: string;
    cursor: string | null;
  }): Promise<McpCatalogPage> {
    const { rows, nextCursor } = await repository.listCatalogServers({
      q,
      cursor,
      limit: MCP_CATALOG_PAGE_SIZE,
      includeHidden: false,
    });
    return { servers: rows.map(toMemberRow), nextCursor };
  }

  async function adminList({
    q,
    cursor,
  }: {
    q: string;
    cursor: string | null;
  }): Promise<McpCatalogAdminPage> {
    const { rows, nextCursor } = await repository.listCatalogServers({
      q,
      cursor,
      limit: MCP_CATALOG_PAGE_SIZE,
      includeHidden: true,
    });
    return { servers: rows.map(toAdminRow), nextCursor };
  }

  async function adminUpdate(input: McpCatalogAdminUpdate): Promise<void> {
    const patch: Parameters<McpMarketplaceRepository['updateCatalogServer']>[1] = {};

    if (input.blocked === true) {
      patch.blocked_at = now().toISOString();
      patch.blocked_reason = input.blockedReason ?? null;
    } else if (input.blocked === false) {
      // A block without a reason is the state this clears, so both go together.
      patch.blocked_at = null;
      patch.blocked_reason = null;
    }

    if (input.nameAr !== undefined) patch.name_ar = input.nameAr?.trim() || null;
    if (input.descriptionAr !== undefined)
      patch.description_ar = input.descriptionAr?.trim() || null;

    if (Object.keys(patch).length === 0) return;
    await repository.updateCatalogServer(input.registryName, patch);
  }

  /**
   * A pass through the registry, bounded by its own deadline.
   *
   * The state row is the only memory between runs: where the pass stopped, when
   * it began (so a completed pass knows which rows the registry no longer
   * serves), and when the last run finished (so an incremental run knows what
   * "since" means).
   */
  async function sync({
    budgetMs = SYNC_BUDGET_MS,
  }: { budgetMs?: number } = {}): Promise<McpCatalogSyncResult> {
    const startedAt = Date.now();
    const deadline = startedAt + budgetMs;
    const state = await repository.getCatalogSyncState();

    const resumingPass = state.pass_started_at !== null && state.pass_completed_at === null;
    const mode: McpCatalogSyncMode =
      resumingPass || state.pass_completed_at === null ? 'pass' : 'incremental';

    const passStartedAt = (resumingPass ? state.pass_started_at : null) ?? now().toISOString();
    let passRows = resumingPass ? state.pass_rows : 0;
    let cursor = resumingPass ? state.cursor : null;

    const baseline = state.last_run_at ?? state.pass_completed_at;
    const updatedSince =
      mode === 'incremental' && baseline
        ? new Date(new Date(baseline).getTime() - INCREMENTAL_OVERLAP_MS).toISOString()
        : null;

    if (mode === 'pass') {
      await repository.saveCatalogSyncState({
        cursor,
        pass_started_at: passStartedAt,
        pass_completed_at: null,
        pass_rows: passRows,
      });
    }

    let pages = 0;
    let rows = 0;
    let skipped = 0;
    let completed = false;
    let error: string | null = null;

    try {
      while (Date.now() < deadline) {
        const page = await registry.listPage({ cursor, updatedSince });
        pages += 1;
        skipped += page.skipped;

        const retire: string[] = [];
        const writes: McpCatalogUpsertRow[] = [];

        for (const entry of page.entries) {
          const row = toUpsertRow(entry);
          if (row) {
            writes.push(row);
          } else if (entry.status === 'deleted') {
            // Retired without an address: the row cannot be upserted, but it
            // must stop appearing all the same.
            retire.push(entry.registryName);
          } else {
            skipped += 1;
          }
        }

        await repository.upsertCatalogServers(writes);
        await repository.retireCatalogServers(retire);

        rows += writes.length;
        passRows += mode === 'pass' ? writes.length : 0;

        if (!page.nextCursor) {
          completed = true;
          break;
        }
        cursor = page.nextCursor;

        await repository.saveCatalogSyncState(
          mode === 'pass'
            ? {
                cursor,
                pass_rows: passRows,
                pass_started_at: passStartedAt,
                pass_completed_at: null,
              }
            : { cursor }
        );
      }
    } catch (caught) {
      // The rows already written stay; the cursor does not move past a page we
      // never read, so the next run starts where this one stopped.
      error = caught instanceof Error ? caught.message : String(caught);
      logger.warn('MCP catalogue: sync run failed', { mode, pages, error });
    }

    const lastRunAt = now().toISOString();
    // A failed run must not move the baseline past rows it never read, or the
    // next incremental run would skip them for good.
    const nextRunAt = error ? state.last_run_at : lastRunAt;
    let deleted = 0;

    if (mode === 'pass' && completed) {
      // Two floors, both about the same failure: a pass that ends early must not
      // mark the catalogue deleted. A handful of rows is an empty registry; a
      // pass that saw less than half of what the store already holds is a
      // truncated registry. A genuine reset below that bar is a deliberate act,
      // and the spec says how (`mcp_catalog_sync_state`).
      const existing = await repository.countCatalogServers();
      const floor = Math.max(MIN_PASS_ROWS, Math.floor(existing / 2));

      if (passRows < floor) {
        error = `the registry returned ${passRows} rows against ${existing} in the store, which is not a complete pass`;
        await repository.saveCatalogSyncState({
          cursor: null,
          pass_rows: passRows,
          last_run_at: nextRunAt,
          last_run_rows: rows,
          last_error: error,
        });
      } else {
        deleted = await repository.markCatalogServersDeleted(passStartedAt);
        await repository.saveCatalogSyncState({
          cursor: null,
          pass_completed_at: lastRunAt,
          pass_rows: 0,
          last_run_at: lastRunAt,
          last_run_rows: rows,
          last_error: null,
        });
      }
    } else {
      await repository.saveCatalogSyncState(
        mode === 'pass'
          ? {
              cursor,
              pass_rows: passRows,
              pass_started_at: passStartedAt,
              pass_completed_at: null,
              last_run_at: nextRunAt,
              last_run_rows: rows,
              last_error: error,
            }
          : { last_run_at: nextRunAt, last_run_rows: rows, last_error: error }
      );
    }

    return { mode, pages, rows, skipped, deleted, completed, error };
  }

  async function probe(registryNames: string[]) {
    const names = [...new Set(registryNames)].filter((name) => name.length > 0);
    if (names.length === 0) return 0;

    const addresses = await repository.getCatalogAddresses(names);
    const due = addresses.filter(
      (row) => row.status === 'active' && row.blocked_at === null && isProbeDue(row, now())
    );
    const batch = due.slice(0, MAX_PROBES_PER_REQUEST);

    await Promise.all(
      batch.map(async (row) => {
        try {
          const verdict = await remote.probeConnectable(row.remote_url);
          await repository.saveCatalogProbe(row.registry_name, {
            connectable: verdict.connectable,
            reason: verdict.reason,
            probedAt: now().toISOString(),
          });
        } catch (caught) {
          // One unreachable server must not cost the page its other verdicts.
          logger.warn('MCP catalogue: probe failed', {
            registryName: row.registry_name,
            error: caught instanceof Error ? caught.message : String(caught),
          });
        }
      })
    );

    return batch.length;
  }

  return { search, adminList, adminUpdate, sync, probe };
}

/** A row nobody has measured, or one whose measurement has aged out. */
function isProbeDue(row: McpCatalogAddressRecord, at: Date): boolean {
  if (!row.probed_at) return true;
  return at.getTime() - new Date(row.probed_at).getTime() > PROBE_TTL_MS;
}
