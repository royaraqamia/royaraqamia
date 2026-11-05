package com.royaraqamia.app.linksnap

/**
 * What the protected-link screen is drawing (#919).
 *
 * The form has four faces on both clients: the password prompt at rest, the
 * button while the server is asked, the refusal the server answered with, and
 * the sentence an offline device gets instead of a guess. The visual gate records
 * the first; the other three are the same form with one line changed, so they are
 * states of this screen rather than screens of their own.
 */
sealed interface LinksnapUnlockUiState {
    data object AtRest : LinksnapUnlockUiState

    data object Busy : LinksnapUnlockUiState

    data object Error : LinksnapUnlockUiState

    data object Offline : LinksnapUnlockUiState

    companion object {
        fun of(busy: Boolean, error: String?, offline: Boolean): LinksnapUnlockUiState =
            when {
                busy -> Busy
                error != null -> Error
                offline -> Offline
                else -> AtRest
            }
    }
}
