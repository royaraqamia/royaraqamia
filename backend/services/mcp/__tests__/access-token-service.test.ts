import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type {
  McpConnectionCredentialsRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import { createMcpAccessTokenService } from '@/backend/services/mcp/marketplace/access-token-service';
import { McpRemoteError } from '@/backend/shared/domain/mcp-remote';
import { decryptSecret, encryptSecret } from '@/backend/shared/mcp-token-crypto';

/**
 * The caller that was missing (#1227).
 *
 * What these pin is the part a reviewer cannot read off the happy path: that a
 * token with life left is never exchanged, that the claim is what stops two
 * callers spending one rotating refresh token, that a provider's refusal becomes
 * the member's «أعد الربط» rather than a failed turn, and that a claim left by a
 * dead process is taken over instead of locking the connection.
 */

const NOW = new Date('2026-11-21T12:00:00.000Z');
const CONNECTION = { id: 'conn-1', server_url: 'https://mcp.notion.example/mcp' };

function credentials(
  patch: Partial<McpConnectionCredentialsRecord> = {}
): McpConnectionCredentialsRecord {
  return {
    connection_id: CONNECTION.id,
    authorization_server: 'https://auth.notion.example',
    token_endpoint: 'https://auth.notion.example/token',
    registration_kind: 'dcr',
    client_id: 'client-1',
    client_secret_enc: null,
    access_token_enc: encryptSecret('access-1'),
    refresh_token_enc: encryptSecret('refresh-1'),
    scope: 'read',
    // An hour of life: the token is fine.
    expires_at: new Date(NOW.getTime() + 3_600_000).toISOString(),
    issued_at: new Date(NOW.getTime() - 60_000).toISOString(),
    metadata: {
      issuer: 'https://auth.notion.example',
      authorization_endpoint: 'https://auth.notion.example/authorize',
      token_endpoint: 'https://auth.notion.example/token',
    },
    refresh_claimed_at: null,
    ...patch,
  };
}

/**
 * The five methods a refresh touches, over one mutable row.
 *
 * A full `McpMarketplaceRepository` fake would be thirty lines of `not used`;
 * the claim itself is modelled the way PostgREST models it — the write matches
 * only when nobody holds the row, and an empty answer means the caller lost.
 */
function fakeRepository(seed: McpConnectionCredentialsRecord) {
  let row: McpConnectionCredentialsRecord | null = { ...seed };
  const patches: Array<{ connectionId: string; patch: Record<string, unknown> }> = [];
  const claims: Array<{ now: string; staleBefore: string }> = [];

  const repository = {
    getCredentials: async () => (row ? { ...row } : null),
    claimRefresh: async (_connectionId: string, now: string, staleBefore: string) => {
      claims.push({ now, staleBefore });
      if (!row) return null;
      if (row.refresh_claimed_at && row.refresh_claimed_at >= staleBefore) return null;
      row = { ...row, refresh_claimed_at: now };
      return { ...row };
    },
    releaseRefresh: async () => {
      if (row) row = { ...row, refresh_claimed_at: null };
    },
    saveCredentials: async (input: Parameters<McpMarketplaceRepository['saveCredentials']>[0]) => {
      row = {
        ...(row as McpConnectionCredentialsRecord),
        access_token_enc: input.accessTokenEnc,
        refresh_token_enc: input.refreshTokenEnc,
        expires_at: input.expiresAt,
        scope: input.scope,
        // The real write clears the claim in the same statement.
        refresh_claimed_at: null,
      };
    },
    updateConnection: async (connectionId: string, patch: Record<string, unknown>) => {
      patches.push({ connectionId, patch });
    },
  } as unknown as McpMarketplaceRepository;

  return {
    repository,
    patches,
    claims,
    row: () => row,
  };
}

function fakeRemote(overrides: Partial<McpRemoteClient> = {}): McpRemoteClient {
  return {
    refresh: vi.fn(async () => ({
      access_token: 'access-2',
      token_type: 'Bearer',
      refresh_token: 'refresh-2',
      expires_in: 3_600,
    })),
    ...overrides,
  } as unknown as McpRemoteClient;
}

beforeEach(() => {
  process.env.MCP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
});

function service(
  seed: McpConnectionCredentialsRecord,
  remote: McpRemoteClient = fakeRemote(),
  sleep = async () => undefined
) {
  const fake = fakeRepository(seed);
  return {
    ...fake,
    remote,
    token: createMcpAccessTokenService({
      repository: fake.repository,
      remote,
      now: () => NOW,
      sleep,
    }),
  };
}

describe('a token with life left', () => {
  it('is used as it is, and nothing is exchanged', async () => {
    const { token, remote, claims } = service(credentials());

    await expect(token.accessToken(CONNECTION)).resolves.toBe('access-1');
    expect(remote.refresh).not.toHaveBeenCalled();
    expect(claims).toHaveLength(0);
  });

  it('is refreshed when the server says it is not good, and the retry is a fresh token', async () => {
    const { token, remote } = service(credentials());

    await expect(token.accessToken(CONNECTION, { force: true })).resolves.toBe('access-2');
    expect(remote.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('a token about to expire', () => {
  it('is refreshed inside the minute, and the new pair is stored encrypted', async () => {
    const seed = credentials({ expires_at: new Date(NOW.getTime() + 30_000).toISOString() });
    const { token, remote, row } = service(seed);

    await expect(token.accessToken(CONNECTION)).resolves.toBe('access-2');

    expect(remote.refresh).toHaveBeenCalledWith({
      discovery: expect.objectContaining({
        authorizationServer: 'https://auth.notion.example',
        tokenEndpoint: 'https://auth.notion.example/token',
        // The grant is scoped to the server the member connected.
        resource: CONNECTION.server_url,
      }),
      client: { clientId: 'client-1', clientSecret: null },
      refreshToken: 'refresh-1',
    });

    const stored = row()!;
    expect(stored.access_token_enc).not.toContain('access-2');
    expect(decryptSecret(stored.access_token_enc)).toBe('access-2');
    expect(decryptSecret(stored.refresh_token_enc!)).toBe('refresh-2');
    expect(Date.parse(stored.expires_at!)).toBe(NOW.getTime() + 3_600_000);
    // The write is the release: a claim left behind would make the next caller
    // wait for the stale window before it could refresh at all.
    expect(stored.refresh_claimed_at).toBeNull();
  });

  it('keeps the old refresh token when the provider does not rotate one', async () => {
    const seed = credentials({ expires_at: new Date(NOW.getTime() + 1_000).toISOString() });
    const remote = fakeRemote({
      refresh: vi.fn(async () => ({
        access_token: 'access-2',
        token_type: 'Bearer',
        expires_in: 3_600,
      })),
    });
    const { token, row } = service(seed, remote);

    await token.accessToken(CONNECTION);

    expect(decryptSecret(row()!.refresh_token_enc!)).toBe('refresh-1');
  });

  it('is never refreshed on the strength of an unstated expiry', async () => {
    const { token, remote } = service(credentials({ expires_at: null }));

    await expect(token.accessToken(CONNECTION)).resolves.toBe('access-1');
    expect(remote.refresh).not.toHaveBeenCalled();
  });
});

describe('two callers, one refresh token', () => {
  it('the loser waits for the winner and uses the token it wrote', async () => {
    // The winner already holds the claim, and its write is what the loser finds.
    const seed = credentials({
      expires_at: new Date(NOW.getTime() + 10_000).toISOString(),
      refresh_claimed_at: new Date(NOW.getTime() - 1_000).toISOString(),
    });
    const fake = fakeRepository(seed);
    let reads = 0;
    const repository = {
      ...fake.repository,
      getCredentials: async () => {
        reads += 1;
        // The first read is the stale row; the second is the winner's write.
        return reads === 1
          ? { ...seed }
          : credentials({ access_token_enc: encryptSecret('access-2') });
      },
    } as unknown as McpMarketplaceRepository;

    const remote = fakeRemote();
    const token = createMcpAccessTokenService({
      repository,
      remote,
      now: () => NOW,
      sleep: async () => undefined,
    });

    await expect(token.accessToken(CONNECTION)).resolves.toBe('access-2');
    // One exchange, by the other caller: this one never spends the token.
    expect(remote.refresh).not.toHaveBeenCalled();
  });

  it('gives up in its own words when the winner never writes', async () => {
    const seed = credentials({
      expires_at: new Date(NOW.getTime() + 10_000).toISOString(),
      refresh_claimed_at: new Date(NOW.getTime() - 1_000).toISOString(),
    });
    const { token, remote } = service(seed);

    await expect(token.accessToken(CONNECTION)).rejects.toMatchObject({
      failure: 'protocol',
    });
    expect(remote.refresh).not.toHaveBeenCalled();
  });

  it('takes over a claim a dead process left behind', async () => {
    const seed = credentials({
      expires_at: new Date(NOW.getTime() + 10_000).toISOString(),
      // Older than the stale window: the process that claimed it is gone.
      refresh_claimed_at: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const { token, remote, claims } = service(seed);

    await expect(token.accessToken(CONNECTION)).resolves.toBe('access-2');
    expect(remote.refresh).toHaveBeenCalledTimes(1);
    expect(claims[0]?.staleBefore).toBe(new Date(NOW.getTime() - 30_000).toISOString());
  });
});

describe('a grant the provider refuses', () => {
  it('becomes needs_reauth instead of a failed turn', async () => {
    const seed = credentials({ expires_at: new Date(NOW.getTime() + 1_000).toISOString() });
    const remote = fakeRemote({
      refresh: vi.fn(async () => {
        throw new McpRemoteError('reauth', 'انتهت صلاحية الوصول إلى التطبيق.');
      }),
    });
    const { token, patches, row } = service(seed, remote);

    await expect(token.accessToken(CONNECTION)).rejects.toMatchObject({ failure: 'reauth' });

    expect(patches).toEqual([
      { connectionId: CONNECTION.id, patch: expect.objectContaining({ status: 'needs_reauth' }) },
    ]);
    // The claim is given back, so the member's own reconnect is not blocked by
    // the failure that sent them there.
    expect(row()!.refresh_claimed_at).toBeNull();
  });

  it('is needs_reauth without a call when no refresh token was ever stored', async () => {
    const seed = credentials({
      expires_at: new Date(NOW.getTime() + 1_000).toISOString(),
      refresh_token_enc: null,
    });
    const { token, remote, patches } = service(seed);

    await expect(token.accessToken(CONNECTION)).rejects.toMatchObject({ failure: 'reauth' });
    expect(remote.refresh).not.toHaveBeenCalled();
    expect(patches[0]?.patch).toMatchObject({ status: 'needs_reauth' });
  });

  it('is needs_reauth when the connection no longer stores a discovery document', async () => {
    const seed = credentials({
      expires_at: new Date(NOW.getTime() + 1_000).toISOString(),
      metadata: null,
    });
    const { token, remote, patches } = service(seed);

    await expect(token.accessToken(CONNECTION)).rejects.toMatchObject({ failure: 'reauth' });
    expect(remote.refresh).not.toHaveBeenCalled();
    expect(patches[0]?.patch).toMatchObject({ status: 'needs_reauth' });
  });
});
