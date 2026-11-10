package com.royaraqamia.app.linksnap

/**
 * What the shortener's account door does when it is pressed (#1208).
 *
 * The site's `LinksnapLinksFab` has two faces: a signed-in member is sent to
 * their owned links, a guest gets the sign-in prompt instead of a redirect to a
 * page they cannot read. The same two are here, so
 * `docs/mobile/parity.json` can hold them against the page's and `check:parity`
 * fails one the other side does not draw.
 */
sealed interface LinksnapLinksFabUiState {
    /** A session is present: the door opens the reader's own links. */
    data object Ready : LinksnapLinksFabUiState

    /** No session: the door says why and offers the sign-in. */
    data object Guest : LinksnapLinksFabUiState
}
