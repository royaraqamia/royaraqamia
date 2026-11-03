package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread

/**
 * What one open conversation is showing (#819).
 *
 * Three faces, and the same three on the site: the thread, a conversation this
 * member may not see ("not found" is the policy's own answer, never a hint), and a
 * read that failed. The last one is separate on purpose: an outage shown as
 * "conversation not found" is the lie ADR-0031 forbids, and the retry is the only
 * control a failed read has.
 *
 * The lines, the draft and the menu are the screen's own state rather than a face
 * here: they describe what the member is doing, not what the read answered.
 */
sealed interface ChatThreadUiState {
    /** The header, roster and rights the server answered. */
    data class Live(val thread: ChatThreadResponseThread) : ChatThreadUiState

    /** The server answered that this thread is not there, or not this member's. */
    data object Missing : ChatThreadUiState

    /** The read failed: no thread, and nothing to draw in its place. */
    data class Unavailable(val offline: Boolean) : ChatThreadUiState
}
