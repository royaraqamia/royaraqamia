package com.royaraqamia.app.linksnap

/**
 * What the shortener is drawing (#916).
 *
 * The site's reference component has three faces and the app draws the same
 * three: the guest form with its sign-in sentence, the signed-in form with the
 * custom code and password, and the success block once a link exists. The four
 * answers of the custom-code check live inside [SignedIn] rather than as states
 * of their own, because the form does not change shape between them.
 */
sealed interface LinksnapShortenerUiState {
    data object Guest : LinksnapShortenerUiState

    data object SignedIn : LinksnapShortenerUiState

    data object Ready : LinksnapShortenerUiState

    companion object {
        fun of(signedIn: Boolean, ready: Boolean): LinksnapShortenerUiState =
            when {
                ready -> Ready
                signedIn -> SignedIn
                else -> Guest
            }
    }
}
