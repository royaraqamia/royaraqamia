/**
 * The failure a third-party MCP call reports, declared outside
 * `backend/clients/mcp-remote` for the reason `backend/shared/domain/ai-chat`
 * exists: a service matches on this class, and a service may not import a value
 * from the clients layer. The client raises it; the domain owns its shape.
 */

import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * A discovery document reduced to what this client needs to keep.
 *
 * It lives here, beside the failure, because a service has to be able to build
 * one without importing the client: a pre-registered client's endpoints are a
 * reviewed table, not a discovery result (`backend/shared/domain/mcp-static-clients.ts`).
 */
export interface McpDiscovery {
  /** The resource server we asked about, canonicalised. */
  resource: string;
  authorizationServer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  scopes: string[];
  /** The brand mark the resource metadata publishes, when it is an https URL. */
  logoUrl: string | null;
  /** Kept verbatim so the connection row can record what it agreed to. */
  metadata: AuthorizationServerMetadata;
}

export type McpRemoteFailure =
  | 'blocked'
  | 'unreachable'
  | 'discovery'
  | 'registration'
  | 'authorization'
  | 'protocol'
  /**
   * The access token was refused (401/403). A token we believed valid may have
   * been revoked or expired early, so a caller refreshes once and retries; a
   * second refusal is `reauth`.
   */
  | 'unauthorized'
  /**
   * The grant itself is gone: the provider refused the refresh token, or the
   * access token it issued is refused. The member has to connect the app again
   * — nothing on this side can repair it, and saying "try again" would be
   * advice that can never work.
   */
  | 'reauth'
  /**
   * The token is good and the scope is not: RFC 6750's `insufficient_scope`.
   * Refreshing cannot repair it — the refresh returns the same grant — so this
   * is not `unauthorized`, and the member is not asked to reconnect a
   * connection that is still alive. What they are told is the permission the
   * provider named, and the repair is a wider consent (`McpRemoteError.missingScope`).
   */
  | 'scope';

/**
 * The RFC 6750 challenge a refused call carries, read for what this side can act
 * on: which refusal it is, and which permission was missing.
 *
 * Measured against Supabase (2026-11-11): `403` plus
 * `Bearer error="insufficient_scope", scope="database:write"`. A `401`, or a
 * `403` carrying `invalid_token`, is an expired or revoked token instead — the
 * two are different repairs, so they are different answers.
 */
export function readAuthChallenge(header: string | null): {
  error: string | null;
  scope: string | null;
} {
  if (!header) return { error: null, scope: null };
  return {
    error: /error="([^"]+)"/.exec(header)?.[1] ?? null,
    scope: /\bscope="([^"]+)"/.exec(header)?.[1] ?? null,
  };
}

/**
 * What the member reads when a tool refused for a scope. It names the
 * permission the provider asked for, because "permission" alone gives them
 * nothing to approve, and it says what to do about it.
 */
export function scopeRequirementSentence(scope: string | null): string {
  return scope
    ? `هذا التطبيق يحتاج صلاحية «${scope}» لأداء هذه العملية، ولم تُمنح عند الربط. أعد الربط ووافق عليها.`
    : 'هذا التطبيق يحتاج صلاحية إضافية لأداء هذه العملية، ولم تُمنح عند الربط. أعد الربط ووافق عليها.';
}

/**
 * Who we are at a provider: the pair the flow stores encrypted, plus the method
 * the token endpoint expects. DCR leaves the method unset because the provider
 * told us during registration; a pre-registered app carries the one its console
 * was configured with.
 */
export interface McpOAuthClient {
  clientId: string;
  clientSecret: string | null;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
}

/**
 * Why a catalogue row cannot be connected, as the catalogue stores it
 * (`mcp_catalog_servers.connectable_reason`, ADR-0155 phase 2).
 *
 * It is a code, not a sentence, for the reason the connect failures are: the
 * stored answer must survive a reworded screen, and one sentence per client is
 * one sentence too many.
 */
export type McpConnectProbeReason =
  | 'no_metadata'
  | 'no_registration'
  | 'blocked'
  /** The server never answered, or answered too slowly to measure. */
  | 'unreachable'
  /**
   * The row is published as `none`, but the server refused an unauthenticated
   * call (#1269). The probe cannot pick the right mode for the admin: it can only
   * say that the decision the row carries does not open the server.
   */
  | 'needs_credentials';

/**
 * How a remote server expects to be authenticated (#1269, ADR-0155 amendment).
 *
 * `oauth` is the consent flow this marketplace was built for; `none` means the
 * server answers without credentials; `api_key` means the member supplies a key,
 * which is sent in the header the server documents.
 */
export type McpAuthMode = 'oauth' | 'none' | 'api_key';

/**
 * The credential one request carries, resolved from the connection's mode.
 *
 * It is a shape rather than a token so the client never has to know where a
 * secret came from, and so a `none` connection is a value instead of a `null`
 * header everyone has to remember not to send.
 */
export type McpRequestAuth =
  | { kind: 'bearer'; token: string }
  | { kind: 'api_key'; header: string; value: string }
  | { kind: 'none' };

/** The verdict a probe records. `null` reason means the row is connectable. */
export interface McpConnectProbe {
  connectable: boolean;
  reason: McpConnectProbeReason | null;
  /**
   * What the probe measured, beside the mode the row carries: `oauth` when
   * metadata and dynamic registration answered, `none` when the handshake
   * succeeded without a credential, `api_key` when the endpoint refused one with
   * a challenge that is not an OAuth document. `null` is "not measured" — an
   * unreachable server, or one that answered nothing recognisable.
   */
  authMode: McpAuthMode | null;
  /**
   * The brand mark the server publishes in its RFC 9728 metadata, if any. It is
   * a fact about the server, not a decision: the store still shows a row only
   * after an admin verifies it.
   */
  logoUrl: string | null;
  logoMime: string | null;
}

/** A failure a caller turns into a sentence, never a stack trace. */
export class McpRemoteError extends Error {
  constructor(
    readonly failure: McpRemoteFailure,
    message: string,
    readonly cause?: unknown,
    /** The permission a `scope` failure named, when the provider named one. */
    readonly missingScope?: string | null
  ) {
    super(message);
    this.name = 'McpRemoteError';
  }
}
