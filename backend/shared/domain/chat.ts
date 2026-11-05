/**
 * The outcomes the chat tables report, and the one rule the database derives.
 *
 * A refusal that is an *outcome* — a direct thread that already exists, a group
 * that is full — crosses the repository seam as its own type, because the
 * service answers it ("the thread you wanted is this one") instead of failing
 * the request. Both sides therefore need the class, and a service may not
 * import a value from `backend/repositories` (`layers/no-cross-layer-import`),
 * so the declaration lives here and the repository that raises it imports it
 * from this module.
 */

/** The pair key the database derives, so the service can look a thread up. */
export function directPairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * Raised when the pair index refuses a second direct thread between the same
 * two people. It is an outcome, not a failure: the service answers with the
 * thread that already exists.
 */
export class DirectThreadExistsError extends Error {
  constructor() {
    super('a direct thread already exists for this pair');
    this.name = 'DirectThreadExistsError';
  }
}

/**
 * Raised when the `chat_conversations` trigger refuses a second assistant
 * thread for one member (#890). Like `DirectThreadExistsError`, it is an
 * outcome the service answers with the thread that already exists.
 */
export class AgentThreadExistsError extends Error {
  constructor() {
    super('an assistant thread already exists for this member');
    this.name = 'AgentThreadExistsError';
  }
}

/**
 * Raised by `private.enforce_chat_thread_size` when a group already holds
 * `CHAT_GROUP_MEMBERS_MAX` live members. A full room is a state the surface
 * explains, not an outage, so it crosses the repository seam as its own type
 * instead of a `RepositoryError` that would answer 500.
 */
export class ChatThreadFullError extends Error {
  constructor() {
    super('the group already holds its maximum members');
    this.name = 'ChatThreadFullError';
  }
}
