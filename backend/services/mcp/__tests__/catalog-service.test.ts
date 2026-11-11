import { describe, expect, it, vi } from 'vitest';

import type {
  McpRegistryClient,
  McpRegistryEntry,
  McpRegistryPage,
} from '@/backend/clients/mcp-registry';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type {
  McpCatalogAddressRecord,
  McpCatalogListRow,
  McpCatalogServerRecord,
  McpCatalogSyncStateRecord,
  McpCatalogUpsertRow,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import { McpCatalogError, createMcpCatalogService } from '../marketplace/catalog-service';

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
  const marked: string[] = [];
  const retired: string[] = [];

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
    getCatalogAddresses: async () => [],
    listVerifiedAddresses: async () => [],
    saveCatalogProbe: async (registryName, probe) => {
      probes.push({ registryName, probe });
    },
    updateCatalogServer: async (registryName, patch) => {
      updates.push({ registryName, patch });
    },
    verifyLaunchSet: async (names) => {
      seeded.push([...names]);
      return 0;
    },
    setTitleOverrideIfEmpty: async () => undefined,
    getCatalogSyncState: async () => ({ ...state }),
    saveCatalogSyncState: async (patch) => {
      Object.assign(state, patch);
    },
    ...overrides,
  };

  return { repository, state, upserts, probes, updates, seeded, marked, retired };
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
}) {
  return createMcpCatalogService({
    repository: options.repository.repository,
    registry: fakeRegistry(options.pages),
    remote: options.remote ?? fakeRemote(),
    now: () => NOW,
  });
}

describe('the registry pass', () => {
  it('pages to the end, completes, and retires what the pass did not see', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [rows(60, 'p2'), rows(60, null)] });

    const result = await service.sync();

    expect(result).toMatchObject({ mode: 'pass', pages: 2, rows: 120, completed: true });
    expect(repository.upserts).toHaveLength(120);
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

    expect(repository.upserts.map((row) => row.registryName)).toEqual(['com.example/public']);
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
    expect(repository.upserts).toEqual([]);
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
});

describe('the takedown and the overrides', () => {
  it('writes the reason with the block, and clears both on undo', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [] });

    await service.adminUpdate({
      registryName: 'com.notion/mcp',
      blocked: true,
      blockedReason: 'يخالف الشروط',
    });
    expect(repository.updates[0]?.patch).toEqual({
      blocked_at: NOW.toISOString(),
      blocked_reason: 'يخالف الشروط',
    });

    await service.adminUpdate({ registryName: 'com.notion/mcp', blocked: false });
    expect(repository.updates[1]?.patch).toEqual({
      blocked_at: null,
      blocked_reason: null,
    });
  });

  it('clears an override with an empty field rather than storing a blank string', async () => {
    const repository = fakeRepository();
    const service = build({ repository, pages: [] });

    await service.adminUpdate({
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

    await service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', verified: true });

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
      service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', verified: true })
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
      service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', verified: true })
    ).rejects.toMatchObject({ failure: 'not_connectable' });
  });

  it('takes the vouch back without touching the rank', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ verified_at: '2026-11-01T00:00:00.000Z' }),
    });
    const service = build({ repository, pages: [] });

    await service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', verified: false });

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

    await service.adminUpdate({
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

    await service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', remoteOverride: ACCOUNT });

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

    expect(remote.probeConnectable).toHaveBeenCalledWith(ACCOUNT);
  });

  it('keeps a verdict when the same address is saved again', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ remote_override: ACCOUNT }),
    });
    const service = build({ repository, pages: [] });

    await service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', remoteOverride: ACCOUNT });

    expect(repository.updates[0]?.patch).toEqual({ remote_override: ACCOUNT });
  });

  it('clears the override so the registry’s own address is followed again', async () => {
    const repository = fakeRepository({
      getCatalogServer: async () => serverRow({ remote_override: ACCOUNT }),
    });
    const service = build({ repository, pages: [] });

    await service.adminUpdate({ registryName: 'com.vercel/vercel-mcp', remoteOverride: null });

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
      service.adminUpdate({
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
      service.adminUpdate({
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
