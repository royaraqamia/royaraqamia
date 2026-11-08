package com.royaraqamia.app.chats

/**
 * Which half of the new-conversation screen is open (#934).
 *
 * The site's panel has two tabs and the app draws the same two: the member
 * directory with its direct picker, and the named group's form. The search, the
 * selected members and the one sentence a refused write carries are fields inside
 * a mode, not states of their own, because the panel does not change shape
 * between them.
 */
sealed interface ChatNewUiState {
    /** The directory's search: one member is picked and opened. */
    data object Direct : ChatNewUiState

    /** A name and 1-31 members; the creator is the 32nd and never picked. */
    data object Group : ChatNewUiState

    companion object {
        fun of(group: Boolean): ChatNewUiState = if (group) Group else Direct
    }
}
