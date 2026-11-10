/**
 * The failure a third-party MCP call reports, declared outside
 * `backend/clients/mcp-remote` for the reason `backend/shared/domain/ai-chat`
 * exists: a service matches on this class, and a service may not import a value
 * from the clients layer. The client raises it; the domain owns its shape.
 */

export type McpRemoteFailure =
  'blocked' | 'unreachable' | 'discovery' | 'registration' | 'authorization' | 'protocol';

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
