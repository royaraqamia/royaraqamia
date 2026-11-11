import { describe, expect, it, vi } from 'vitest';

import type {
  McpCatalogListRow,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpCatalogService } from '../marketplace/catalog-service';
import type { McpStaticClientMap } from '@/backend/shared/domain/mcp-static-clients';
import { McpCatalogAgentError, createMcpCatalogAgentService } from '../marketplace/catalog-agent';

/**
 * The agent's rules, pinned where a mistake would publish something a person
 * did not measure: a copy that names text the mirror does not hold, a publish
 * whose class checks are missing, and a skip that is a category rather than a
 * sentence.
 */

const NOW = new Date('2026-11-14T12:00:00.000Z');
const REDIRECT = 'https://royaraqamia.com/mcp/callback';

function row(overrides: Partial<McpCatalogListRow> = {}): McpCatalogListRow {
  return {
    registry_name: 'com.github/mcp',
    title: 'GitHub',
    title_override: null,
    description: 'Repositories and issues',
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
    probe_icon_url: 'https://github.com/logo.svg',
    probe_icon_mime: 'image/svg+xml',
    icon_override: null,
    featured_rank: null,
    verified_at: null,
    blocked_at: null,
    blocked_reason: null,
    connectable: true,
    connectable_reason: null,
    probed_at: NOW.toISOString(),
    ...overrides,
  };
}

function staticClient(): McpStaticClientMap {
  return new Map([
    [
      'com.github/mcp',
      {
        registryName: 'com.github/mcp',
        clientId: 'client-id',
        clientSecret: 'secret',
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

function build(
  overrides: {
    rows?: McpCatalogListRow[];
    server?: McpCatalogListRow | null;
  } = {}
) {
  const adminUpdate = vi.fn(async () => undefined);
  const recordCatalogEvent = vi.fn(async () => undefined);
  const saveCatalogProbe = vi.fn(async () => undefined);
  const repository = {
    listAgentCandidates: async () => overrides.rows ?? [row()],
    catalogCoverage: async () => ({ eligible: 1, published: 0, waiting: 0 }),
    getCatalogServer: async () => (overrides.server === undefined ? row() : overrides.server),
    recordCatalogEvent,
    saveCatalogProbe,
  } as unknown as McpMarketplaceRepository;

  const service = createMcpCatalogAgentService({
    repository,
    catalog: { adminUpdate } as unknown as McpCatalogService,
    staticClients: staticClient(),
    redirectUri: REDIRECT,
    now: () => NOW,
  });

  return { service, adminUpdate, recordCatalogEvent, saveCatalogProbe };
}

describe('the candidates', () => {
  it('hands out the reviewed client’s public half and the callback it is registered with', async () => {
    const { service } = build();

    const { candidates } = await service.candidates(5);
    const candidate = candidates[0];

    expect(candidate).toMatchObject({
      registryName: 'com.github/mcp',
      remoteUrl: 'https://api.githubcopilot.com/mcp/',
      iconUrl: 'https://github.com/logo.svg',
      redirectUri: REDIRECT,
      staticClient: {
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        clientId: 'client-id',
      },
    });
  });
});

describe('a copy', () => {
  it('refuses text the mirror does not hold', async () => {
    const { service, adminUpdate } = build();

    await expect(
      service.act({
        action: 'copy',
        registryName: 'com.github/mcp',
        nameAr: 'جيتهب',
        source: { title: 'GitHub', description: 'Something else' },
      })
    ).rejects.toBeInstanceOf(McpCatalogAgentError);

    expect(adminUpdate).not.toHaveBeenCalled();
  });

  it('writes a translation of the registry description', async () => {
    const { service, adminUpdate } = build();

    await service.act({
      action: 'copy',
      registryName: 'com.github/mcp',
      titleOverride: 'GitHub',
      nameAr: 'جيتهب',
      descriptionAr: 'المستودعات والمشكلات',
      source: { title: 'GitHub', description: 'Repositories and issues' },
    });

    expect(adminUpdate).toHaveBeenCalledWith(
      {
        registryName: 'com.github/mcp',
        titleOverride: 'GitHub',
        nameAr: 'جيتهب',
        descriptionAr: 'المستودعات والمشكلات',
      },
      { actor: 'agent:mcp-catalog', source: 'registry' }
    );
  });
});

describe('a publish', () => {
  it('refuses a class whose checks are missing', async () => {
    const { service, saveCatalogProbe } = build();

    await expect(
      service.act({
        action: 'verify',
        registryName: 'com.github/mcp',
        class: 'dcr',
        checks: [{ name: 'probe', ok: true, detail: null }],
      })
    ).rejects.toMatchObject({ failure: 'invalid_checks' });

    expect(saveCatalogProbe).not.toHaveBeenCalled();
  });

  it('records the measured verdict and the checks behind the publish', async () => {
    const { service, saveCatalogProbe, adminUpdate } = build();
    const checks = [
      { name: 'probe' as const, ok: true, detail: null },
      { name: 'authorize' as const, ok: true, detail: null },
      { name: 'admission' as const, ok: true, detail: null },
    ];

    await service.act({
      action: 'verify',
      registryName: 'com.github/mcp',
      class: 'pre_registered',
      checks,
    });

    expect(saveCatalogProbe).toHaveBeenCalledWith('com.github/mcp', {
      connectable: true,
      reason: null,
      probedAt: NOW.toISOString(),
      iconUrl: 'https://github.com/logo.svg',
      iconMime: 'image/svg+xml',
    });
    expect(adminUpdate).toHaveBeenCalledWith(
      { registryName: 'com.github/mcp', verified: true },
      {
        actor: 'agent:mcp-catalog',
        source: 'machine',
        evidence: { class: 'pre_registered', checks },
      }
    );
  });

  it('refuses a blocked row before it writes a verdict', async () => {
    const { service, saveCatalogProbe } = build({
      server: row({ blocked_at: NOW.toISOString() }),
    });

    await expect(
      service.act({
        action: 'verify',
        registryName: 'com.github/mcp',
        class: 'pre_registered',
        checks: [
          { name: 'probe', ok: true, detail: null },
          { name: 'authorize', ok: true, detail: null },
          { name: 'admission', ok: true, detail: null },
        ],
      })
    ).rejects.toMatchObject({ failure: 'not_publishable' });

    expect(saveCatalogProbe).not.toHaveBeenCalled();
  });
});

describe('a skip', () => {
  it('is a category with its reason, appended to the log', async () => {
    const { service, recordCatalogEvent } = build();

    await service.act({
      action: 'skip',
      registryName: 'com.github/mcp',
      reason: 'no_mark',
      detail: 'no mark from any allowed source',
    });

    expect(recordCatalogEvent).toHaveBeenCalledWith({
      registryName: 'com.github/mcp',
      actor: 'agent:mcp-catalog',
      action: 'skip',
      source: 'none',
      evidence: { reason: 'no_mark', detail: 'no mark from any allowed source' },
    });
  });
});
