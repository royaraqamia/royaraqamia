import type {
  McpCatalogAddressRecord,
  McpCatalogListRow,
  McpCatalogUpsertRow,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpRegistryClient, McpRegistryEntry } from '@/backend/clients/mcp-registry';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type { McpStaticClientMap } from '@/backend/shared/domain/mcp-static-clients';
import { requestedScopesFor } from '@/backend/config/mcp-scopes';
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

/**
 * The launch set: a store that opens empty is a store nobody visits.
 *
 * These are the providers measured connectable in the plan (`docs/specs/mcp-marketplace.md`)
 * and demanded by members. The sync verifies them once, so the curated store has
 * something in it on its first day; the probe still decides whether each appears,
 * and an admin who withdraws one is not overruled (the withdrawal is a column).
 * It is a seed, not a policy: nothing outside this list is verified without a
 * human.
 */
const LAUNCH_SET = [
  'com.vercel/vercel-mcp',
  'app.linear/linear',
  'com.supabase/mcp',
  'io.github.getsentry/sentry-mcp',
  'com.canva.mcp/mcp',
  'com.cloudflare.mcp/mcp',
] as const;

/**
 * The names the store should show for the launch set. The registry publishes no
 * title for Vercel or Cloudflare, and "Canva MCP" is the publisher's phrasing;
 * a directory that says `com.vercel/vercel-mcp` is the screenshot this change
 * exists to delete.
 */
const LAUNCH_TITLES: Record<(typeof LAUNCH_SET)[number], string> = {
  'com.vercel/vercel-mcp': 'Vercel',
  'app.linear/linear': 'Linear',
  'com.supabase/mcp': 'Supabase',
  'io.github.getsentry/sentry-mcp': 'Sentry',
  'com.canva.mcp/mcp': 'Canva',
  'com.cloudflare.mcp/mcp': 'Cloudflare',
};

/**
 * The rows the registry does not carry, written here because a reviewed client
 * needs a row to hang from (issue #1229).
 *
 * GitHub publishes a remote MCP server and is not in the registry at all, so
 * there is nothing for the mirror to copy: the address, the name and the
 * description are ours, and the sync upserts them on every run. They are written
 * **before** the sweep that retires rows the registry stopped serving, so a
 * curated row is never mistaken for one that vanished.
 *
 * A curated row is a publisher entry, not a vouch: it still needs an admin to
 * verify it, and the store still hides it until the probe (or its
 * pre-registered client) says it can be connected.
 */
const CURATED_SERVERS: readonly McpCatalogUpsertRow[] = [
  {
    registryName: 'com.github/mcp',
    title: 'GitHub',
    description:
      "Repositories, issues, pull requests, code search and projects, through GitHub's remote MCP server.",
    version: null,
    remoteUrl: 'https://api.githubcopilot.com/mcp/',
    iconUrl: null,
    iconMime: null,
    status: 'active',
    publishedAt: null,
    registryUpdatedAt: null,
    raw: null,
  },
];

const CURATED_TITLES: Record<string, string> = Object.fromEntries(
  CURATED_SERVERS.map((row) => [row.registryName, row.title ?? row.registryName])
);

/**
 * The marks we ship, per catalogue row, as same-origin paths.
 *
 * The registry's `icons` and the provider's `logo_uri` are empty for the rows
 * members ask for most, so eleven cards fell back to eleven letters. These are
 * the publishers' own marks, taken from Simple Icons (CC0) and served from
 * `public/brand/mcp`, which keeps the rule the icon proxy exists for: a
 * member's browser never fetches a third party. The mark stays the owner's
 * trademark, used to identify the app it belongs to.
 *
 * `icon_override` is written only where it is null, so a mark an admin changes
 * later survives the daily sync. Canva is absent: Simple Icons has no mark for
 * it, and a wrong logo is worse than a monogram.
 */
const BRAND_MARKS: Record<string, string> = {
  'com.github/mcp': '/brand/mcp/github.svg',
  'com.notion/mcp': '/brand/mcp/notion.svg',
  'com.figma.mcp/mcp': '/brand/mcp/figma.svg',
  'com.atlassian/atlassian-mcp-server': '/brand/mcp/atlassian.svg',
  'com.stripe/mcp': '/brand/mcp/stripe.svg',
  'com.vercel/vercel-mcp': '/brand/mcp/vercel.svg',
  'com.supabase/mcp': '/brand/mcp/supabase.svg',
  'app.linear/linear': '/brand/mcp/linear.svg',
  'io.github.getsentry/sentry-mcp': '/brand/mcp/sentry.svg',
  'com.cloudflare.mcp/mcp': '/brand/mcp/cloudflare.svg',
};

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
   * due. Called after the response, never inside it. `force` is the Admin
   * Console's "فحص الآن": a provider that fixed its metadata should not wait a
   * week for the cache to expire.
   */
  probe(registryNames: string[], options?: { force?: boolean }): Promise<number>;
}

/** A refusal from the Admin Console that has a sentence for the person who asked. */
export type McpCatalogAdminFailure =
  'unknown_app' | 'not_connectable' | 'invalid_remote' | 'invalid_icon' | 'no_mark';

export class McpCatalogError extends Error {
  constructor(
    readonly failure: McpCatalogAdminFailure,
    message: string
  ) {
    super(message);
    this.name = 'McpCatalogError';
  }
}

interface CatalogServiceDependencies {
  repository: McpMarketplaceRepository;
  registry: McpRegistryClient;
  remote: McpRemoteClient;
  /** The reviewed clients a row can be connected with, keyed by catalogue row. */
  staticClients?: McpStaticClientMap;
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
    title: row.title_override ?? row.title,
    description: row.description_ar ?? row.description,
    nameAr: row.name_ar,
    iconUrl: row.icon_override ?? row.probe_icon_url ?? row.registry_icon_url,
    verified: row.verified_at !== null,
    featuredRank: row.featured_rank,
    connectable: row.connectable,
    connectableReason: connectReason(row.connectable_reason),
    publishedAt: row.published_at,
    // The sheet names the ask before the member leaves for the provider's own
    // consent screen, which is the only place we can put it in Arabic.
    requestedScopes: [...(requestedScopesFor(row.registry_name) ?? [])],
  };
}

function toAdminRow(row: McpCatalogListRow, preRegistered: boolean): McpCatalogAdminRow {
  return {
    ...toMemberRow(row),
    registrationKind: preRegistered ? 'static' : 'dcr',
    titleOverride: row.title_override,
    iconOverride: row.icon_override,
    descriptionAr: row.description_ar,
    remoteUrl: row.remote_url,
    remoteOverride: row.remote_override,
    remoteOptions: registryRemotes(row.raw),
    status: row.status,
    version: row.version,
    iconMime: row.probe_icon_mime ?? row.registry_icon_mime,
    blocked: row.blocked_at !== null,
    blockedReason: row.blocked_reason,
    probedAt: row.probed_at,
    verifiedAt: row.verified_at,
    fetchedAt: row.fetched_at,
  };
}

/**
 * The addresses the registry published for this row, read from the document it
 * sent. The mirror keeps its own reduced fields; this is the one place the raw
 * entry is mined, and it only feeds an admin's choice — a malformed entry is
 * skipped rather than allowed to break the list.
 */
function registryRemotes(raw: unknown): McpCatalogAdminRow['remoteOptions'] {
  if (!raw || typeof raw !== 'object') return [];
  const server = (raw as { server?: unknown }).server;
  if (!server || typeof server !== 'object') return [];
  const remotes = (server as { remotes?: unknown }).remotes;
  if (!Array.isArray(remotes)) return [];

  const options: McpCatalogAdminRow['remoteOptions'] = [];
  for (const remote of remotes) {
    if (!remote || typeof remote !== 'object') continue;
    const { url, type } = remote as { url?: unknown; type?: unknown };
    if (typeof url !== 'string' || url.length === 0) continue;
    options.push({ url, type: typeof type === 'string' && type.length > 0 ? type : 'remote' });
  }
  return options;
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
    iconUrl: entry.iconUrl,
    iconMime: entry.iconMime,
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
  staticClients = new Map(),
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
      storeOnly: true,
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
      storeOnly: false,
    });
    return {
      servers: rows.map((row) => toAdminRow(row, staticClients.has(row.registry_name))),
      nextCursor,
    };
  }

  async function adminUpdate(input: McpCatalogAdminUpdate): Promise<void> {
    const patch: Parameters<McpMarketplaceRepository['updateCatalogServer']>[1] = {};
    // The row is read once, and only when an edit needs to know what it is
    // replacing: two reads in one request could disagree.
    let server: Awaited<ReturnType<McpMarketplaceRepository['getCatalogServer']>> | undefined;

    async function currentRow() {
      if (server === undefined) server = await repository.getCatalogServer(input.registryName);
      if (!server || server.status === 'deleted') {
        throw new McpCatalogError('unknown_app', 'هذا التطبيق غير موجود في المتجر');
      }
      return server;
    }

    /*
      The remote an admin chooses replaces the one the mirror picked, and it is
      the address that was measured: a row that moves loses its verdict, the
      probe's mark and the date, in the same write. The registry's own entry is
      left alone, so clearing the override follows it again.
    */
    let remoteMoved = false;
    if (input.remoteOverride !== undefined) {
      const next = input.remoteOverride?.trim() || null;
      if (next !== null) {
        try {
          assertEgressUrl(next);
        } catch (error) {
          if (error instanceof EgressBlockedError) {
            throw new McpCatalogError('invalid_remote', error.message);
          }
          throw error;
        }
      }

      const existing = await currentRow();
      remoteMoved =
        (existing.remote_override ?? existing.remote_url) !== (next ?? existing.remote_url);
      patch.remote_override = next;

      if (remoteMoved) {
        patch.connectable = null;
        patch.connectable_reason = null;
        patch.probed_at = null;
        patch.probe_icon_url = null;
        patch.probe_icon_mime = null;
      }
    }

    if (input.blocked === true) {
      patch.blocked_at = now().toISOString();
      patch.blocked_reason = input.blockedReason ?? null;
    } else if (input.blocked === false) {
      // A block without a reason is the state this clears, so both go together.
      patch.blocked_at = null;
      patch.blocked_reason = null;
    }

    if (input.nameAr !== undefined) patch.name_ar = input.nameAr?.trim() || null;
    if (input.titleOverride !== undefined)
      patch.title_override = input.titleOverride?.trim() || null;
    if (input.descriptionAr !== undefined)
      patch.description_ar = input.descriptionAr?.trim() || null;
    if (input.featuredRank !== undefined) patch.featured_rank = input.featuredRank;

    /*
      The mark is the third source, and the only one an admin writes: a path we
      ship (`/brand/...`) or an https URL the publisher serves. Anything else is
      refused, because a member's browser will render whatever this holds — the
      proxy only ever fetches it through the egress policy.
    */
    if (input.iconOverride !== undefined) {
      const next = input.iconOverride?.trim() || null;
      if (next !== null) {
        if (next.startsWith('/')) {
          if (!next.startsWith('/brand/')) {
            throw new McpCatalogError(
              'invalid_icon',
              'الشعار يجب أن يكون مساراً من شعاراتنا أو رابط https.'
            );
          }
        } else {
          try {
            assertEgressUrl(next);
          } catch (error) {
            if (error instanceof EgressBlockedError) {
              throw new McpCatalogError('invalid_icon', error.message);
            }
            throw error;
          }
        }
      }
      patch.icon_override = next;
    }

    if (input.verified === true) {
      /*
        Verification is a vouch, not a measurement, so a first vouch needs the
        measurement to exist. A row already verified can still be edited — its
        rank, for instance — even if a later probe has not run yet. A request
        that also moves the remote cannot vouch for the new address in the same
        breath: it has not been measured.
      */
      const existing = await currentRow();
      if (remoteMoved || (existing.verified_at === null && existing.connectable !== true)) {
        throw new McpCatalogError(
          'not_connectable',
          'لا يمكن اعتماد تطبيق لم يثبت أن ربطه ممكن. افحصه الآن ثم أعد المحاولة.'
        );
      }
      /*
        The store's promise includes the mark: a row a member cannot recognise
        is the letter tile ADR-0162 exists to delete. The check is on the first
        vouch only — a row already published can still be edited while its mark
        is being fixed.
      */
      if (existing.verified_at === null) {
        const mark =
          patch.icon_override !== undefined
            ? patch.icon_override
            : (existing.icon_override ?? existing.probe_icon_url ?? existing.registry_icon_url);
        if (!mark) {
          throw new McpCatalogError(
            'no_mark',
            'لا يمكن اعتماد تطبيق بلا شعار: بطاقته سترسم حرفاً بدل علامته. أضف الشعار ثم أعد المحاولة.'
          );
        }
      }
      // Saving a verified row's rank must not move the date it was vouched for.
      patch.verified_at = existing.verified_at ?? now().toISOString();
      patch.verification_withdrawn_at = null;
    } else if (input.verified === false) {
      patch.verified_at = null;
      // The seed must not undo this on the next sync.
      patch.verification_withdrawn_at = now().toISOString();
    }

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

    /*
      The curated rows are written before anything sweeps: a pass that retires
      what the registry stopped serving must not see a row the registry never
      served as one that vanished (`markCatalogServersDeleted` compares
      `fetched_at` against the pass's start, and this write is after it).
    */
    try {
      await repository.upsertCatalogServers([...CURATED_SERVERS]);
    } catch (caught) {
      logger.warn('MCP catalogue: curated rows failed to write', {
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }

    /*
      The store's rows are the promise, so they are measured on the sync rather
      than only when a screen draws them: a verified server that went down must
      stop being offered, and one that came back must return. It is a small
      batch because the pass already spent its budget on the registry.
    */
    try {
      await probeAddresses(await repository.listVerifiedAddresses(MAX_PROBES_PER_REQUEST));
    } catch (caught) {
      logger.warn('MCP catalogue: verified probe failed', {
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }

    /*
      The launch set, seeded after the pass so a row the registry just added is
      already in the mirror. It verifies only rows an admin has never withdrawn
      and that are active and unblocked; the probe still decides whether each one
      appears, because the store's query also asks for `connectable = true`.
    */
    try {
      // The launch set plus the rows the registry does not carry: a curated row
      // is seeded and measured the same way, because a provider we wrote by hand
      // is still one a member taps.
      const seedNames = [...LAUNCH_SET, ...CURATED_SERVERS.map((row) => row.registryName)];
      const seedTitles: Record<string, string> = { ...LAUNCH_TITLES, ...CURATED_TITLES };
      const seeded = await repository.verifyLaunchSet(seedNames, now().toISOString());
      // The first run that seeds them measures them too: waiting for the daily
      // verified probe would leave the store empty for days. They run in
      // parallel, so this is one probe's wall time rather than six.
      if (seeded > 0) {
        for (const [registryName, title] of Object.entries(seedTitles)) {
          await repository.setTitleOverrideIfEmpty(registryName, title);
        }
        await probeAddresses(await repository.getCatalogAddresses(seedNames), seedNames.length);
      }

      /*
        The brand marks run on every sync, not only on the run that seeds the
        store: a store that is already verified is exactly where the eleven
        letters were. The write is a no-op wherever a mark already exists, so a
        daily run costs one skipped update per row.
      */
      for (const [registryName, icon] of Object.entries(BRAND_MARKS)) {
        await repository.setIconOverrideIfEmpty(registryName, icon);
      }
    } catch (caught) {
      logger.warn('MCP catalogue: launch set seed failed', {
        error: caught instanceof Error ? caught.message : String(caught),
      });
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

  /** Measures a batch of due rows. The callers differ only in where the rows came from. */
  async function probeAddresses(
    addresses: McpCatalogAddressRecord[],
    limit = MAX_PROBES_PER_REQUEST,
    force = false
  ): Promise<number> {
    const due = addresses.filter(
      (row) =>
        row.status === 'active' && row.blocked_at === null && (force || isProbeDue(row, now()))
    );
    const batch = due.slice(0, limit);

    await Promise.all(
      batch.map(async (row) => {
        try {
          const verdict = await remote.probeConnectable(row.remote_override ?? row.remote_url, {
            preRegistered: staticClients.has(row.registry_name),
          });
          await repository.saveCatalogProbe(row.registry_name, {
            connectable: verdict.connectable,
            reason: verdict.reason,
            probedAt: now().toISOString(),
            iconUrl: verdict.logoUrl,
            iconMime: verdict.logoMime,
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

  async function probe(registryNames: string[], { force = false }: { force?: boolean } = {}) {
    const names = [...new Set(registryNames)].filter((name) => name.length > 0);
    if (names.length === 0) return 0;

    return probeAddresses(
      await repository.getCatalogAddresses(names),
      MAX_PROBES_PER_REQUEST,
      force
    );
  }

  return { search, adminList, adminUpdate, sync, probe };
}

/** A row nobody has measured, or one whose measurement has aged out. */
function isProbeDue(row: McpCatalogAddressRecord, at: Date): boolean {
  if (!row.probed_at) return true;
  return at.getTime() - new Date(row.probed_at).getTime() > PROBE_TTL_MS;
}
