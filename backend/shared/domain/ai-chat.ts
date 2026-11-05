/**
 * What the assistant's provider answered when it refused a turn.
 *
 * The client raises it with the provider's HTTP status, and the service decides
 * what the member is told (`402`/`429` are a plan or a wait, anything else is an
 * outage). The class is the seam between them, and a service may not import a
 * value from `backend/clients` (`layers/no-cross-layer-import`), so it is
 * declared here and the client imports it.
 */

export class AiChatProviderError extends Error {
  constructor(
    /** The provider's HTTP status, or the one the client answers with. */
    readonly status: number,
    message = 'the assistant provider refused the request'
  ) {
    super(message);
    this.name = 'AiChatProviderError';
  }
}
