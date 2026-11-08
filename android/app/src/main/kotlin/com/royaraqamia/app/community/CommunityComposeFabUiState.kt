package com.royaraqamia.app.community

/**
 * What the feed's compose control opens (#924).
 *
 * The site's `ComposeFab` has two faces: a signed-in member gets the composer,
 * a guest gets the sign-in prompt instead of a redirect. The same two are here,
 * so `docs/mobile/parity.json` can hold them against the page's and
 * `check:parity` fails one the other side does not draw.
 */
sealed interface CommunityComposeFabUiState {
    /** A session is present: the control opens the composer. */
    data object Ready : CommunityComposeFabUiState

    /** No session: the control says why and offers the sign-in. */
    data object Guest : CommunityComposeFabUiState
}
