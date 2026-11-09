package com.royaraqamia.app.chats

/**
 * The new-conversation screen's search (#934).
 *
 * The site's panel is one member search: a query, the read while it runs, and
 * the answer it draws. These are the three faces the screen can show; the term,
 * the results and the busy flag are fields, not states, because the screen does
 * not change shape between them.
 */
sealed interface ChatNewUiState {
    /** The directory is ready for a query or drawing its results. */
    data object Search : ChatNewUiState

    /** The query is out and the directory has not answered yet. */
    data object Searching : ChatNewUiState

    /** The directory answered with nobody. */
    data object NoResults : ChatNewUiState
}
