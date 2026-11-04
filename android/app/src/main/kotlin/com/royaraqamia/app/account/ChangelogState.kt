package com.royaraqamia.app.account

/**
 * What the changelog screen is showing (#951).
 *
 * The page's own states are the ones the file can answer with: a list, or the
 * sentence it draws when the file holds nothing to show. The loading face is a
 * state rather than `null` because the screen has a sentence for it (the site's
 * `aria-label`), and `docs/mobile/parity.json` lists the states a port draws.
 *
 * There is no separate failure state: the page's reader answers a failed fetch
 * with an empty list, so a phone that cannot reach the file draws the same
 * sentence the browser does rather than a face the page does not have.
 */
sealed interface ChangelogUiState {
    /** Before the file answers: the site's skeleton. */
    data object Loading : ChangelogUiState

    /** The releases worth drawing, possibly none. */
    data class Ready(val releases: List<ChangelogRelease>) : ChangelogUiState
}
