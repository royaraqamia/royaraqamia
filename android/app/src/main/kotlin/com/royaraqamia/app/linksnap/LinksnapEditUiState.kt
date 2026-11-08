package com.royaraqamia.app.linksnap

/**
 * The edit dialog's slug check, in the five faces the page draws (#944).
 *
 * The page's `useSlugAvailability` answers one of these while a signed-in member
 * types a custom code: the hint before there is enough to ask, the wait while
 * the 400 ms debounce and the request run, the server's yes or no, and the
 * refusal to guess while the radio is off. The dialog declares them so the pair
 * list names every face both clients draw.
 */
sealed interface LinksnapEditUiState {
    data object Idle : LinksnapEditUiState

    data object Checking : LinksnapEditUiState

    data object Available : LinksnapEditUiState

    data object Taken : LinksnapEditUiState

    data object Offline : LinksnapEditUiState
}
