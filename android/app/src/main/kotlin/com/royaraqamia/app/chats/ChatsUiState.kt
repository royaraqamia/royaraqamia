package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItem

/**
 * What the Chats tab is showing (#819).
 *
 * The site's tab has the same three faces and no fourth: a list, a server that
 * answered with no threads, and a read that failed. The failure is its own state
 * rather than an empty list, because an unreachable server is not "you have no
 * conversations" (ADR-0031) — the sentence says which answer failed, and the
 * screen offers one retry.
 *
 * The loading face is not a state: it is `null` in the screen, drawn as the
 * recipe's skeleton, because there is no sentence to say while nothing is known.
 */
sealed interface ChatsUiState {
    /** The rows the server answered, in its own order. */
    data class Live(val threads: List<ChatThreadsResponseThreadsItem>) : ChatsUiState

    /** The server answered, and this member has no conversations. */
    data object Empty : ChatsUiState

    /** Nothing to show: no answer, and nothing to fall back on. */
    data class Unavailable(val offline: Boolean) : ChatsUiState

    companion object {
        /** One read as a state, with an empty page folded into [Empty]. */
        fun of(threads: List<ChatThreadsResponseThreadsItem>): ChatsUiState =
            if (threads.isEmpty()) Empty else Live(threads)
    }
}
