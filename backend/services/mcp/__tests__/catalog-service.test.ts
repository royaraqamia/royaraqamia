import { describe, expect, it, vi } from 'vitest';

import type {
  McpRegistryClient,
  McpRegistryEntry,
  McpRegistryPage,
} from '@/backend/clients/mcp-registry';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type { McpStaticClientMap } from '@/backend/shared/domain/mcp-static-clients';
import type {
  McpCatalogAddressRecord,
  McpCatalogEventInput,
  McpCatalogListRow,
  McpCatalogServerRecord,
  McpCatalogSyncStateRecord,
  McpCatalogUpsertRow,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import {
  McpCatalogError,
  createMcpCatalogService,
  type McpCatalogService,
} from '../marketplace/catalog-service';
import type { McpCatalogAdminUpdate } from '@/shared/contracts/mcp-catalog';

/**
 * The catalogue, driven against an in-memory store and a fake registry.
 *
 * What these pin is the part a reviewer cannot read off the happy path: that a
 * pass which ends after a handful of rows is treated as an outage and marks
 * nothing deleted, that an incremental run asks the registry for what changed
 * rather than for everything, that a package or a private host never enters the
 * mirror, that a verdict is only measured for rows that are due, and that a
 * takedown and its reason move together.
 */

const NOW = new Date('2026-11-14T12:00:00.000Z');

/** The actor every console write in this file claims to be. */
const ADMIN = { actor: 'admin@example.com' } as const;

/** A console write, with the actor the controller supplies. */
function adminUpdate(service: McpCatalogService, input: McpCatalogAdminUpdate) {
  return service.adminUpdate(input, ADMIN);
}

function emptyState(): McpCatalogSyncStateRecord {
  return {
    cursor: null,
    pass_started_at: null,
    pass_completed_at: null,
    pass_rows: 0,
    last_run_at: null,
    last_run_rows: 0,
    last_error: null,
  };
}

function fakeRepository(overrides: Partial<McpMarketplaceRepository> = {}) {
  const state = emptyState();
  const upserts: McpCatalogUpsertRow[] = [];
  const probes: Array<{
    registryName: string;
    probe: Parameters<McpMarketplaceRepository['saveCatalogProbe']>[1];
  }> = [];
  const updates: Array<{ registryName: string; patch: unknown }> = [];
  const seeded: string[][] = [];
  const marks: Array<{ registryName: string; icon: string }> = [];
  const marked: string[] = [];
  const retired: string[] = [];
  const events: McpCatalogEventInput[] = [];

  const repository: McpMarketplaceRepository = {
    getCatalogServer: async () => null,
    findLiveConnection: async () => null,
    getConnection: async () => null,
    listConnections: async () => [],
    deleteConnection: async () => false,
    setToolEnabled: async () => false,
    createConnection: async () => {
      throw new Error('not used');
    },
    updateConnection: async () => undefined,
    saveCredentials: async () => undefined,
    getCredentials: async () => null,
    claimRefresh: async () => null,
    releaseRefresh: async () => undefined,
    listUsableTools: async () => [],
    saveTools: async () => undefined,
    listTools: async () => [],
    saveAttempt: async () => undefined,
    claimAttempt: async () => null,
    getRegistration: async () => null,
    saveRegistration: async () => undefined,
    upsertCatalogServers: async (rows) => {
      upserts.push(...rows);
    },
    markCatalogServersDeleted: async (seenBefore) => {
      marked.push(seenBefore);
      return 3;
    },
    retireCatalogServers: async (names) => {
      retired.push(...names);
    },
    countCatalogServers: async () => 0,
    listCatalogServers: async () => ({ rows: [], nextCursor: null }),
    listAgentCandidates: async () => [],
    getCatalogAddresses: async () => [],
    listVerifiedAddresses: async () => [],
    saveCatalogProbe: async (registryName, probe) => {
      probes.push({ registryName, probe });
    },
    updateCatalogServer: async (registryName, patch) => {
      updates.push({ registryName, patch });
    },
    recordCatalogEvent: async (event) => {
      events.push(event);
    },
    latestCatalogVerifications: async () => [],
    verifyLaunchSet: async (names) => {
      seeded.push([...names]);
      return 0;
    },
    setTitleOverrideIfEmpty: async () => undefined,
    setIconOverrideIfEmpty: async (registryName, icon) => {
      marks.push({ registryName, icon });
    },
    getCatalogSyncState: async () => ({ ...state }),
    saveCatalogSyncState: async (patch) => {
      Object.assign(state, patch);
    },
    ...overrides,
  };

  return { repository, state, upserts, probes, updates, seeded, marked, retired, marks, events };
}

function fakeRegistry(pages: McpRegistryPage[]): McpRegistryClient {
  let index = 0;
  return {
    listPage: vi.fn(async () => pages[index++] ?? { entries: [], nextCursor: null, skipped: 0 }),
  };
}

function fakeRemote(overrides: Partial<McpRemoteClient> = {}): McpRemoteClient {
  return {
    discover: vi.fn(),
    register: vi.fn(),
    authorizeUrl: vi.fn(),
    exchange: vi.fn(),
    refresh: vi.fn(),
    listTools: vi.fn(),
    probeConnectable: vi.fn(async () => ({
      connectable: true,
      reason: null,
      logoUrl: null,
      logoMime: null,
    })),
    ...overrides,
  } as McpRemoteClient;
}

function entry(overrides: Partial<McpRegistryEntry> = {}): McpRegistryEntry {
  return {
    registryName: 'com.example/mcp',
    title: 'Example',
    description: 'An example server',
    version: '1.0.0',
    remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com/mcp' }],
    iconUrl: null,
    iconMime: null,
    status: 'active',
    publishedAt: '2026-11-01T00:00:00.000Z',
    registryUpdatedAt: '2026-11-01T00:00:00.000Z',
    raw: {},
    ...overrides,
  };
}

/** Enough rows for a pass to be a registry rather than an outage. */
function rows(count: number, nextCursor: string | null): McpRegistryPage {
  return {
    entries: Array.from({ length: count }, (_, index) =>
      entry({ registryName: `com.example/s${String(index).padStart(3, '0')}` })
    ),
    nextCursor,
    skipped: 0,
  };
}

function build(options: {
  repository: ReturnType<typeof fakeRepository>;
  pages: McpRegistryPage[];
  remote?: McpRemoteClient;
  staticClients?: McpStaticClientMap;
}) {
  return createMcpCatalogService({
    repository: options.repository.repository,
    registry: fakeRegistry(options.pages),
    remote: options.remote ?? fakeRemote(),
    ...(options.staticClients ? { staticClients: options.staticClients } : {}),
    now: () => NOW,
  });
}

/**
 * The rows the registry pass wrote. The sync also writes the curated rows the
 * registry does not carry (#1229) on every run, so a test about the mirror
 * filters those out rather than counting them as registry entries.
 */
function mirrored(upserts: McpCatalogUpsertRow[]): McpCatalogUpsertRow[] {
  return upserts.filter((row) => row.registryName !== 'com.github/mcp');
}

describe('the registry pass', () => {
  it('pages to the end, completes, and retires what the pass did not see', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [rows(60, 'p2'), rows(60, null)] });

    const result = await service.sync();

    expect(result).toMatchObject({ mode: 'pass', pages: 2, rows: 120, completed: true });
    expect(mirrored(repository.upserts)).toHaveLength(120);
    expect(repository.marked).toEqual([NOW.toISOString()]);
    expect(repository.state.pass_completed_at).toBe(NOW.toISOString());
    expect(repository.state.cursor).toBeNull();
    expect(repository.state.pass_rows).toBe(0);
  });

  it('treats a pass that ends after a handful of rows as an outage', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [rows(2, null)] });

    const result = await service.sync();

    expect(result.completed).toBe(true);
    expect(result.error).toContain('not a complete pass');
    // The one thing an outage must never do: empty the store.
    expect(repository.marked).toEqual([]);
    expect(repository.state.pass_completed_at).toBeNull();
    expect(repository.state.pass_started_at).toBe(NOW.toISOString());
  });

  it('treats a pass that saw far less than the store holds as truncated', async () => {
    const repository = fakeRepository({ countCatalogServers: async () => 1000 });
    const service = build({ repository, pages: [rows(120, null)] });

    const result = await service.sync();

    expect(result.error).toContain('not a complete pass');
    expect(repository.marked).toEqual([]);
  });

  it('resumes a pass from its saved cursor', async () => {
    const repository = fakeRepository();
    repository.state.cursor = 'page-9';
    repository.state.pass_started_at = '2026-11-13T00:00:00.000Z';
    repository.state.pass_rows = 500;

    const registry = fakeRegistry([rows(60, null)]);
    const service = createMcpCatalogService({
      repository: repository.repository,
      registry,
      remote: fakeRemote(),
      now: () => NOW,
    });

    const result = await service.sync();

    expect(registry.listPage).toHaveBeenCalledWith({ cursor: 'page-9', updatedSince: null });
    expect(result.mode).toBe('pass');
    // 500 before this run plus 60 here: the pass is still a pass.
    expect(repository.marked).toEqual(['2026-11-13T00:00:00.000Z']);
  });

  it('asks for what changed, not for everything, once a pass has completed', async () => {
    const repository = fakeRepository();
    repository.state.pass_started_at = '2026-11-10T00:00:00.000Z';
    repository.state.pass_completed_at = '2026-11-10T01:00:00.000Z';
    repository.state.last_run_at = '2026-11-12T00:00:00.000Z';

    const registry = fakeRegistry([rows(5, null)]);
    const service = createMcpCatalogService({
      repository: repository.repository,
      registry,
      remote: fakeRemote(),
      now: () => NOW,
    });

    const result = await service.sync();

    expect(result.mode).toBe('incremental');
    // One hour of overlap, so a clock that disagrees cannot drop a change.
    expect(registry.listPage).toHaveBeenCalledWith({
      cursor: null,
      updatedSince: '2026-11-11T23:00:00.000Z',
    });
    // An incremental run says nothing about what the registry stopped serving.
    expect(repository.marked).toEqual([]);
  });

  it('keeps the baseline where it was when a run fails', async () => {
    const repository = fakeRepository();
    repository.state.pass_started_at = '2026-11-10T00:00:00.000Z';
    repository.state.pass_completed_at = '2026-11-10T01:00:00.000Z';
    repository.state.last_run_at = '2026-11-12T00:00:00.000Z';

    const service = createMcpCatalogService({
      repository: repository.repository,
      registry: {
        listPage: vi.fn(async () => {
          throw new Error('registry is down');
        }),
      },
      remote: fakeRemote(),
      now: () => NOW,
    });

    const result = await service.sync();

    expect(result.error).toBe('registry is down');
    expect(repository.state.last_run_at).toBe('2026-11-12T00:00:00.000Z');
    expect(repository.state.last_error).toBe('registry is down');
  });
});

describe('what enters the mirror', () => {
  it('drops a package server and a private host, and keeps the remote one', async () => {
    const repository = fakeRepository();
    const service = build({
      repository,
      pages: [
        {
          entries: [
            entry({
              registryName: 'com.example/npm',
              remotes: [{ type: 'npm', url: 'https://registry.npmjs.org/x' }],
            }),
            entry({
              registryName: 'com.example/private',
              remotes: [{ type: 'streamable-http', url: 'https://10.0.0.5/mcp' }],
            }),
            entry({ registryName: 'com.example/public' }),
          ],
          nextCursor: null,
          skipped: 0,
        },
      ],
    });

    await service.sync();

    expect(mirrored(repository.upserts).map((row) => row.registryName)).toEqual([
      'com.example/public',
    ]);
  });

  it('retires a deleted row the registry no longer gives an address for', async () => {
    const repository = fakeRepository();
    const service = build({
      repository,
      pages: [
        {
          entries: [entry({ registryName: 'com.example/gone', status: 'deleted', remotes: [] })],
          nextCursor: null,
          skipped: 0,
        },
      ],
    });

    await service.sync();

    expect(repository.retired).toEqual(['com.example/gone']);
    expect(mirrored(repository.upserts)).toEqual([]);
  });
});

describe('the search', () => {
  const listRows: McpCatalogListRow[] = [
    {
      registry_name: 'com.notion/mcp',
      title: 'Notion',
      title_override: null,
      description: 'Pages and databases',
      name_ar: null,
      description_ar: 'صفحات وقواعد بيانات',
      remote_url: 'https://mcp.notion.example/mcp',
      remote_override: null,
      status: 'active',
      version: '1.0.0',
      published_at: '2026-11-01T00:00:00.000Z',
      fetched_at: '2026-11-14T00:00:00.000Z',
      registry_icon_url: 'https://cdn.example/notion.png',
      registry_icon_mime: 'image/png',
      probe_icon_url: null,
      probe_icon_mime: null,
      icon_override: null,
      featured_rank: 3,
      verified_at: '2026-11-14T00:00:00.000Z',
      blocked_at: null,
      blocked_reason: null,
      connectable: false,
      connectable_reason: 'no_registration',
      probed_at: '2026-11-14T00:00:00.000Z',
    },
  ];

  it('draws the Arabic description when one exists, and the Latin name always', async () => {
    const repository = fakeRepository({
      listCatalogServers: async () => ({ rows: listRows, nextCursor: 'next' }),
    });
    const service = build({ repository, pages: [] });

    const page = await service.search({ q: 'notion', cursor: null });

    expect(page.nextCursor).toBe('next');
    expect(page.servers[0]).toMatchObject({
      title: 'Notion',
      description: 'صفحات وقواعد بيانات',
      iconUrl: 'https://cdn.example/notion.png',
      verified: true,
      featuredRank: 3,
      connectable: false,
      connectableReason: 'no_registration',
    });
  });

  it('carries the permissions the row asks for, and none for an unmeasured row (#1230)', async () => {
    const first = listRows[0]!;
    const repository = fakeRepository({
      listCatalogServers: async () => ({
        rows: [{ ...first, registry_name: 'com.supabase/mcp' }, first],
        nextCursor: null,
      }),
    });
    const service = build({ repository, pages: [] });

    const page = await service.search({ q: '', cursor: null });

    // The sheet reads this before the member leaves for the provider's own
    // consent screen, so it is the ask — the flow still drops what the provider
    // stops advertising.
    expect(page.servers[0]?.requestedScopes).toContain('database:read');
    expect(page.servers[0]?.requestedScopes).not.toContain('secrets:read');
    expect(page.servers[1]?.requestedScopes).toEqual([]);
  });
});

describe('the takedown and the overrides', () => {
  it('writes the reason with the block, and clears both on undo', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [] });

    await adminUpdate(service, {
      registryName: 'com.notion/mcp',
      blocked: true,
      blockedReason: 'يخالف الشروط',
    });
    expect(repository.updates[0]?.patch).toEqual({
      blocked_at: NOW.toISOString(),
      blocked_reason: 'يخالف الشروط',
    });

    await adminUpdate(service, { registryName: 'com.notion/mcp', blocked: false });
    expect(repository.updates[1]?.patch).toEqual({
      blocked_at: null,
      blocked_reason: null,
    });
  });

  it('clears an override with an empty field rather than storing a blank string', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, {
      registryName: 'com.notion/mcp',
      nameAr: '  ',
      descriptionAr: 'وصف',
    });

    expect(repository.updates[0]?.patch).toEqual({
      name_ar: null,
      description_ar: 'وصف',
    });
  });
});

describe('the connectability probe', () => {
  function address(overrides: Partial<McpCatalogAddressRecord> = {}): McpCatalogAddressRecord {
    return {
      registry_name: 'com.example/mcp',
      remote_url: 'https://mcp.example.com/mcp',
      remote_override: null,
      probed_at: null,
      blocked_at: null,
      status: 'active',
      ...overrides,
    };
  }

  it('measures only the rows that are due, and never a blocked or retired one', async () => {
    const addresses: McpCatalogAddressRecord[] = [
      address({ registry_name: 'a/never' }),
      address({ registry_name: 'a/stale', probed_at: '2026-11-01T00:00:00.000Z' }),
      address({ registry_name: 'a/fresh', probed_at: '2026-11-13T00:00:00.000Z' }),
      address({ registry_name: 'a/blocked', blocked_at: '2026-11-01T00:00:00.000Z' }),
      address({ registry_name: 'a/deleted', status: 'deleted' }),
    ];

    const repository = fakeRepository({ getCatalogAddresses: async () => addresses });
    const remote = fakeRemote({
      probeConnectable: vi.fn(async () => ({
        connectable: false,
        reason: 'no_metadata' as const,
        logoUrl: null,
        logoMime: null,
      })),
    });
    const service = build({ repository, pages: [], remote });

    const measured = await service.probe(addresses.map((row) => row.registry_name));

    expect(measured).toBe(2);
    expect(repository.probes.map((row) => row.registryName).sort()).toEqual(['a/never', 'a/stale']);
    expect(repository.probes[0]?.probe).toEqual({
      connectable: false,
      reason: 'no_metadata',
      probedAt: NOW.toISOString(),
      iconUrl: null,
      iconMime: null,
    });
  });

  it('keeps the mark the server publishes alongside the verdict', async () => {
    const repository = fakeRepository({
      getCatalogAddresses: async () => [address({ registry_name: 'com.vercel/vercel-mcp' })],
    });
    const remote = fakeRemote({
      probeConnectable: vi.fn(async () => ({
        connectable: true,
        reason: null,
        logoUrl: 'https://mcp.vercel.com/icons/vercel-light.svg',
        logoMime: 'image/svg+xml',
      })),
    });
    const service = build({ repository, pages: [], remote });

    await service.probe(['com.vercel/vercel-mcp']);

    expect(repository.probes[0]?.probe).toMatchObject({
      iconUrl: 'https://mcp.vercel.com/icons/vercel-light.svg',
      iconMime: 'image/svg+xml',
    });
  });

  it('re-measures a verified row on the sync, even when no screen asked', async () => {
    const verified = [address({ registry_name: 'com.vercel/vercel-mcp' })];
    const repository = fakeRepository({ listVerifiedAddresses: async () => verified });
    const remote = fakeRemote();
    const service = build({ repository, pages: [rows(120, null)], remote });

    await service.sync();

    expect(remote.probeConnectable).toHaveBeenCalledTimes(1);
    expect(repository.probes.map((row) => row.registryName)).toEqual(['com.vercel/vercel-mcp']);
  });

  it('seeds the launch set on the sync, so a curated store is not empty', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [rows(120, null)] });

    await service.sync();

    expect(repository.seeded).toHaveLength(1);
    expect(repository.seeded[0]).toEqual(
      expect.arrayContaining([
        'com.vercel/vercel-mcp',
        'app.linear/linear',
        'com.supabase/mcp',
        'com.canva.mcp/mcp',
        'com.cloudflare.mcp/mcp',
      ])
    );
  });

  it('measures the launch set on the run that seeds it', async () => {
    const repository = fakeRepository({
      verifyLaunchSet: async () => 6,
      getCatalogAddresses: async () => [address({ registry_name: 'com.vercel/vercel-mcp' })],
    });
    const remote = fakeRemote();
    const service = build({ repository, pages: [rows(120, null)], remote });

    await service.sync();

    expect(remote.probeConnectable).toHaveBeenCalledTimes(1);
    expect(repository.probes.map((row) => row.registryName)).toEqual(['com.vercel/vercel-mcp']);
  });

  it('probes at most five rows in one request', async () => {
    const addresses = Array.from({ length: 9 }, (_, index) =>
      address({ registry_name: `a/s${index}` })
    );
    const repository = fakeRepository({ getCatalogAddresses: async () => addresses });
    const service = build({ repository, pages: [] });

    const measured = await service.probe(addresses.map((row) => row.registry_name));

    expect(measured).toBe(5);
    expect(repository.probes).toHaveLength(5);
  });

  it('re-measures a fresh row only when the admin forces it', async () => {
    const fresh = [address({ registry_name: 'a/fresh', probed_at: '2026-11-13T00:00:00.000Z' })];
    const repository = fakeRepository({ getCatalogAddresses: async () => fresh });
    const service = build({ repository, pages: [] });

    expect(await service.probe(['a/fresh'])).toBe(0);
    expect(await service.probe(['a/fresh'], { force: true })).toBe(1);
  });
});

function serverRow(overrides: Partial<McpCatalogServerRecord> = {}): McpCatalogServerRecord {
  return {
    registry_name: 'com.vercel/vercel-mcp',
    title: 'Vercel',
    title_override: 'Vercel',
    description: 'An MCP server for Vercel',
    name_ar: null,
    description_ar: null,
    remote_url: 'https://mcp.vercel.com',
    remote_override: null,
    status: 'active',
    blocked_at: null,
    blocked_reason: null,
    registry_icon_url: 'https://mcp.vercel.com/icons/vercel-light.svg',
    registry_icon_mime: 'image/svg+xml',
    probe_icon_url: null,
    probe_icon_mime: null,
    icon_override: null,
    verified_at: null,
    connectable: true,
    connectable_reason: null,
    probed_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('the store admission', () => {
  it('verifies a measured row and records the moment', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', verified: true });

    expect(repository.updates[0]?.patch).toEqual({
      verified_at: NOW.toISOString(),
      verification_withdrawn_at: null,
    });
  });

  it('refuses to vouch for a row the probe never measured', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () =>
        serverRow({ connectable: null, connectable_reason: null, probed_at: null }),
    });
    const service = build({ repository, pages: [] });

    await expect(
      adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', verified: true })
    ).rejects.toBeInstanceOf(McpCatalogError);

    expect(repository.updates).toEqual([]);
  });

  it('refuses to vouch for a row the probe found unconnectable', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () =>
        serverRow({ connectable: false, connectable_reason: 'no_registration' }),
    });
    const service = build({ repository, pages: [] });

    await expect(
      adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', verified: true })
    ).rejects.toMatchObject({ failure: 'not_connectable' });
  });

  it('takes the vouch back without touching the rank', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ verified_at: '2026-11-01T00:00:00.000Z' }),
    });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', verified: false });

    expect(repository.updates[0]?.patch).toEqual({
      verified_at: null,
      verification_withdrawn_at: NOW.toISOString(),
    });
  });

  it('lets a verified row change its rank before the next probe', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () =>
        serverRow({
          verified_at: '2026-11-01T00:00:00.000Z',
          connectable: null,
          connectable_reason: null,
          probed_at: null,
        }),
    });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, {
      registryName: 'com.vercel/vercel-mcp',
      verified: true,
      featuredRank: 2,
    });

    expect(repository.updates[0]?.patch).toEqual({
      featured_rank: 2,
      verified_at: '2026-11-01T00:00:00.000Z',
      verification_withdrawn_at: null,
    });
  });
});

describe('the remote choice', () => {
  const ACCOUNT = 'https://observability.mcp.cloudflare.com/mcp';

  it('stores the admin’s address and clears the verdict that measured the old one', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', remoteOverride: ACCOUNT });

    expect(repository.updates[0]?.patch).toEqual({
      remote_override: ACCOUNT,
      connectable: null,
      connectable_reason: null,
      probed_at: null,
      probe_icon_url: null,
      probe_icon_mime: null,
    });
  });

  it('measures the chosen address rather than the one the mirror picked', async () => {
    const address = (overrides: Partial<McpCatalogAddressRecord> = {}) => ({
      registry_name: 'com.cloudflare.mcp/mcp',
      remote_url: 'https://docs.mcp.cloudflare.com/mcp',
      remote_override: null,
      probed_at: null,
      blocked_at: null,
      status: 'active',
      ...overrides,
    });
    const repository = fakeRepository({
      getCatalogAddresses: async () => [address({ remote_override: ACCOUNT })],
    });
    const remote = fakeRemote();
    const service = build({ repository, pages: [], remote });

    await service.probe(['com.cloudflare.mcp/mcp'], { force: true });

    expect(remote.probeConnectable).toHaveBeenCalledWith(ACCOUNT, { preRegistered: false });
  });

  it('keeps a verdict when the same address is saved again', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ remote_override: ACCOUNT }),
    });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', remoteOverride: ACCOUNT });

    expect(repository.updates[0]?.patch).toEqual({ remote_override: ACCOUNT });
  });

  it('clears the override so the registry’s own address is followed again', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ remote_override: ACCOUNT }),
    });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', remoteOverride: null });

    expect(repository.updates[0]?.patch).toMatchObject({
      remote_override: null,
      connectable: null,
      probed_at: null,
    });
  });

  it('refuses an address the egress policy would not fetch', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await expect(
      adminUpdate(service, {
        registryName: 'com.vercel/vercel-mcp',
        remoteOverride: 'http://mcp.vercel.com',
      })
    ).rejects.toMatchObject({ failure: 'invalid_remote' });

    expect(repository.updates).toEqual([]);
  });

  it('refuses to vouch for an address it has not measured in the same request', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await expect(
      adminUpdate(service, {
        registryName: 'com.vercel/vercel-mcp',
        remoteOverride: ACCOUNT,
        verified: true,
      })
    ).rejects.toMatchObject({ failure: 'not_connectable' });

    expect(repository.updates).toEqual([]);
  });

  it('offers the registry’s own addresses beside the one it keeps', async () => {
    const repository = fakeRepository({
      listCatalogServers: async () => ({
        rows: [
          {
            ...serverRow(),
            title_override: null,
            version: '1.0.0',
            published_at: null,
            fetched_at: NOW.toISOString(),
            featured_rank: null,
            raw: {
              server: {
                name: 'com.cloudflare.mcp/mcp',
                remotes: [
                  { type: 'streamable-http', url: 'https://docs.mcp.cloudflare.com/mcp' },
                  { type: 'streamable-http', url: ACCOUNT },
                  { type: 'sse', url: 'https://sse.mcp.cloudflare.com/sse' },
                ],
              },
            },
          } as unknown as McpCatalogListRow,
        ],
        nextCursor: null,
      }),
    });
    const service = build({ repository, pages: [] });

    const page = await service.adminList({ q: '', cursor: null });

    expect(page.servers[0]?.remoteOptions).toEqual([
      { type: 'streamable-http', url: 'https://docs.mcp.cloudflare.com/mcp' },
      { type: 'streamable-http', url: ACCOUNT },
      { type: 'sse', url: 'https://sse.mcp.cloudflare.com/sse' },
    ]);
  });
});

describe('a pre-registered client (issue #1229)', () => {
  const GITHUB = 'com.github/mcp';

  function staticClient() {
    return new Map([
      [
        GITHUB,
        {
          registryName: GITHUB,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          authorizationServer: 'https://github.com/login/oauth',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          revocationEndpoint: null,
          scopes: ['repo'],
          tokenEndpointAuthMethod: 'client_secret_post' as const,
        },
      ],
    ]);
  }

  it('probes its row as pre-registered, so the missing endpoint is not a refusal', async () => {
    const address: McpCatalogAddressRecord = {
      registry_name: GITHUB,
      remote_url: 'https://api.githubcopilot.com/mcp/',
      remote_override: null,
      probed_at: null,
      blocked_at: null,
      status: 'active',
    };
    const repository = fakeRepository({ getCatalogAddresses: async () => [address] });
    const remote = fakeRemote();
    const service = build({ repository, pages: [], remote, staticClients: staticClient() });

    await service.probe([GITHUB]);

    expect(remote.probeConnectable).toHaveBeenCalledWith('https://api.githubcopilot.com/mcp/', {
      preRegistered: true,
    });
    expect(repository.probes[0]?.probe.connectable).toBe(true);
  });

  it('writes the curated row the registry does not carry', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [rows(120, null)] });

    await service.sync();

    const curated = repository.upserts.find((row) => row.registryName === GITHUB);
    expect(curated).toMatchObject({
      title: 'GitHub',
      remoteUrl: 'https://api.githubcopilot.com/mcp/',
      status: 'active',
    });
    // Written before the sweep, so a pass never retires it as a vanished row.
    expect(repository.upserts.indexOf(curated!)).toBeGreaterThanOrEqual(120);
  });

  it('seeds it with the launch set and names it in the admin list', async () => {
    const repository = fakeRepository({
      listCatalogServers: async () => ({
        rows: [
          {
            registry_name: GITHUB,
            title: 'GitHub',
            title_override: 'GitHub',
            description: "GitHub's remote MCP server",
            name_ar: null,
            description_ar: null,
            remote_url: 'https://api.githubcopilot.com/mcp/',
            remote_override: null,
            status: 'active',
            version: null,
            published_at: null,
            fetched_at: NOW.toISOString(),
            registry_icon_url: null,
            registry_icon_mime: null,
            probe_icon_url: null,
            probe_icon_mime: null,
            icon_override: null,
            featured_rank: null,
            verified_at: NOW.toISOString(),
            blocked_at: null,
            blocked_reason: null,
            connectable: true,
            connectable_reason: null,
            probed_at: NOW.toISOString(),
          },
        ],
        nextCursor: null,
      }),
    });
    const service = build({ repository, pages: [rows(120, null)], staticClients: staticClient() });

    await service.sync();
    const page = await service.adminList({ q: '', cursor: null });

    expect(repository.seeded[0]).toContain(GITHUB);
    expect(page.servers[0]?.registrationKind).toBe('static');
  });
});

describe('the mark an admin chooses', () => {
  it('accepts a path we ship', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, {
      registryName: 'com.vercel/vercel-mcp',
      iconOverride: '/brand/mcp/vercel.svg',
    });

    expect(repository.updates[0]?.patch).toEqual({ icon_override: '/brand/mcp/vercel.svg' });
  });

  it('refuses a path outside our marks and a non-https URL', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await expect(
      adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', iconOverride: '/etc/passwd' })
    ).rejects.toMatchObject({ failure: 'invalid_icon' });

    await expect(
      adminUpdate(service, {
        registryName: 'com.vercel/vercel-mcp',
        iconOverride: 'http://cdn.example/logo.svg',
      })
    ).rejects.toMatchObject({ failure: 'invalid_icon' });
  });

  it('refuses a first vouch for a row with no mark at all', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () =>
        serverRow({
          registry_icon_url: null,
          registry_icon_mime: null,
          probe_icon_url: null,
          probe_icon_mime: null,
        }),
    });
    const service = build({ repository, pages: [] });

    await expect(
      adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', verified: true })
    ).rejects.toMatchObject({ failure: 'no_mark' });
  });

  it('accepts the first vouch when the same request supplies the mark', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () =>
        serverRow({
          registry_icon_url: null,
          registry_icon_mime: null,
          probe_icon_url: null,
          probe_icon_mime: null,
        }),
    });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, {
      registryName: 'com.vercel/vercel-mcp',
      verified: true,
      iconOverride: 'https://mcp.vercel.com/icon.svg',
    });

    expect(repository.updates[0]?.patch).toMatchObject({
      icon_override: 'https://mcp.vercel.com/icon.svg',
      verified_at: NOW.toISOString(),
    });
  });
});

describe('brand marks (the eleven letters)', () => {
  it('seeds the shipped mark for every row that has one, on every sync', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [rows(120, null)] });

    await service.sync();

    const github = repository.marks.find((mark) => mark.registryName === 'com.github/mcp');
    expect(github).toEqual({
      registryName: 'com.github/mcp',
      icon: '/brand/mcp/github.svg',
    });
  });

  it("prefers the mark we ship over the registry's and the probe's", async () => {
    const repository = fakeRepository({
      listCatalogServers: async () => ({
        rows: [
          {
            registry_name: 'com.vercel/vercel-mcp',
            title: 'Vercel',
            title_override: 'Vercel',
            description: 'An MCP server for Vercel',
            name_ar: null,
            description_ar: null,
            remote_url: 'https://mcp.vercel.com',
            remote_override: null,
            status: 'active',
            version: null,
            published_at: null,
            fetched_at: NOW.toISOString(),
            registry_icon_url: 'https://registry.example/vercel.png',
            registry_icon_mime: 'image/png',
            probe_icon_url: 'https://mcp.vercel.com/logo.svg',
            probe_icon_mime: 'image/svg+xml',
            icon_override: '/brand/mcp/vercel.svg',
            featured_rank: null,
            verified_at: NOW.toISOString(),
            blocked_at: null,
            blocked_reason: null,
            connectable: true,
            connectable_reason: null,
            probed_at: NOW.toISOString(),
          },
        ],
        nextCursor: null,
      }),
    });
    const service = build({ repository, pages: [] });

    const page = await service.search({ q: '', cursor: null });

    expect(page.servers[0]?.iconUrl).toBe('/brand/mcp/vercel.svg');
  });
});

describe('the verification log (#1293)', () => {
  it('records exactly one verify event, naming the actor and the check it rested on', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await service.adminUpdate(
      { registryName: 'com.vercel/vercel-mcp', verified: true, featuredRank: 2 },
      { actor: 'admin@example.com' }
    );

    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({
      registryName: 'com.vercel/vercel-mcp',
      actor: 'admin@example.com',
      action: 'verify',
      source: 'machine',
    });
    expect(repository.events[0]?.evidence).toMatchObject({
      connectable: true,
      probedAt: NOW.toISOString(),
    });
  });

  it('records nothing when a verified row only changes its rank', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ verified_at: '2026-11-01T00:00:00.000Z' }),
    });
    const service = build({ repository, pages: [] });

    await service.adminUpdate(
      { registryName: 'com.vercel/vercel-mcp', verified: true, featuredRank: 5 },
      ADMIN
    );

    expect(repository.updates[0]?.patch).toMatchObject({ featured_rank: 5 });
    expect(repository.events).toEqual([]);
  });

  it('records one withdraw event that names when the row had been published', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ verified_at: '2026-11-01T00:00:00.000Z' }),
    });
    const service = build({ repository, pages: [] });

    await service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', verified: false }, ADMIN);

    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({ action: 'withdraw', actor: ADMIN.actor });
    expect(repository.events[0]?.evidence).toMatchObject({
      verifiedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('records a shipped mark as ours, and a measured one by its measured source', async () => {
    const shipped = fakeRepository({ getCatalogServer: async () => serverRow() });
    await adminUpdate(build({ repository: shipped, pages: [] }), {
      registryName: 'com.vercel/vercel-mcp',
      iconOverride: '/brand/mcp/vercel.svg',
    });

    expect(shipped.events[0]).toMatchObject({
      action: 'mark',
      source: 'repo',
      evidence: { field: 'icon_override', value: '/brand/mcp/vercel.svg' },
    });

    const measured = fakeRepository({
      getCatalogServer: async () =>
        serverRow({ probe_icon_url: 'https://mcp.vercel.com/logo.svg' }),
    });
    await adminUpdate(build({ repository: measured, pages: [] }), {
      registryName: 'com.vercel/vercel-mcp',
      iconOverride: 'https://mcp.vercel.com/logo.svg',
    });

    expect(measured.events[0]).toMatchObject({ action: 'mark', source: 'logo_uri' });
  });

  it('records a copy write with the fields and the registry text it came from', async () => {
    const repository = fakeRepository({ getCatalogServer: async () => serverRow() });
    const service = build({ repository, pages: [] });

    await service.adminUpdate(
      {
        registryName: 'com.vercel/vercel-mcp',
        nameAr: 'فيرسل',
        descriptionAr: 'خادم للتطبيقات',
      },
      ADMIN
    );

    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({ action: 'copy', source: 'registry' });
    expect(repository.events[0]?.evidence).toMatchObject({
      fields: ['name_ar', 'description_ar'],
      registry: { title: 'Vercel', description: 'An MCP server for Vercel' },
    });
  });

  it('records nothing when the copy saves the text that is already there', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ title_override: 'Vercel' }),
    });
    const service = build({ repository, pages: [] });

    await adminUpdate(service, { registryName: 'com.vercel/vercel-mcp', titleOverride: 'Vercel' });

    expect(repository.events).toEqual([]);
  });

  it('draws the newest verify or withdraw beside the row', async () => {
    const repository = fakeRepository({
      listCatalogServers: async () => ({
        rows: [serverRow() as unknown as McpCatalogListRow],
        nextCursor: null,
      }),
      latestCatalogVerifications: async () => [
        {
          registry_name: 'com.vercel/vercel-mcp',
          actor: 'agent:mcp-catalog',
          action: 'verify',
          source: 'machine',
          evidence: {},
          created_at: '2026-11-14T09:00:00.000Z',
        },
      ],
    });
    const service = build({ repository, pages: [] });

    const page = await service.adminList({ q: '', cursor: null });

    expect(page.servers[0]?.lastVerification).toEqual({
      action: 'verify',
      actor: 'agent:mcp-catalog',
      at: '2026-11-14T09:00:00.000Z',
    });
  });
});
