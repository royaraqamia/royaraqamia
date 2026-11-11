/**
 * The failure a third-party MCP call reports, declared outside
 * `backend/clients/mcp-remote` for the reason `backend/shared/domain/ai-chat`
 * exists: a service matches on this class, and a service may not import a value
 * from the clients layer. The client raises it; the domain owns its shape.
 */

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
  | 'reauth';

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
  | 'unreachable';

/** The verdict a probe records. `null` reason means the row is connectable. */
export interface McpConnectProbe {
  connectable: boolean;
  reason: McpConnectProbeReason | null;
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
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'McpRemoteError';
  }
}
