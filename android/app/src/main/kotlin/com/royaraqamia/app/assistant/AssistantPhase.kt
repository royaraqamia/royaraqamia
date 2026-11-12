package com.royaraqamia.app.assistant

/**
 * What نور is doing, as the one line the sheet's header and the chats row draw
 * (ADR-0173).
 *
 * The three live phases are the turn's own; [Proposal] outlives the stream
 * because a write waits for the member, so it is "blocked on you", not activity.
 * A phase is never stored: the turn is the only thing that can assert it.
 */
enum class AssistantPhase {
    Thinking,
    Writing,
    Tool,
    Proposal,
}
