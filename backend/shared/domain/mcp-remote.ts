/**
 * The failure a third-party MCP call reports, declared outside
 * `backend/clients/mcp-remote` for the reason `backend/shared/domain/ai-chat`
 * exists: a service matches on this class, and a service may not import a value
 * from the clients layer. The client raises it; the domain owns its shape.
 */

export type McpRemoteFailure =
  'blocked' | 'unreachable' | 'discovery' | 'registration' | 'authorization' | 'protocol';

/**
 * Why a catalogue row cannot be connected, as the catalogue stores it
 * (`mcp_catalog_servers.connectable_reason`, ADR-0155 phase 2).
 *
 * It is a code, not a sentence, for the reason the connect failures are: the
 * stored answer must survive a reworded screen, and one sentence per client is
 * one sentence too many.
 */
export type McpConnectProbeReason = 'no_metadata' | 'no_registration' | 'blocked';

/** The verdict a probe records. `null` reason means the row is connectable. */
export interface McpConnectProbe {
  connectable: boolean;
  reason: McpConnectProbeReason | null;
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
