package com.royaraqamia.app.community

/**
 * What the community composer's publish control is doing (#924).
 *
 * The four faces are the page's own publish states rather than a generic
 * spinner: at rest the control offers the publish, publishing is the moment
 * between the tap and the answer, a failure names the refusal, and published is
 * the sentence the page toasts once the row exists. Kept a sealed interface so
 * `docs/mobile/parity.json` can hold them against the website's, and
 * `check:parity` fails one the other side does not draw.
 */
sealed interface CommunityComposerUiState {
    /** Nothing has been sent yet: the control is the publish. */
    data object AtRest : CommunityComposerUiState

    /** The write is in flight. */
    data object Publishing : CommunityComposerUiState

    /** The last publish was refused, or never reached the server. */
    data class Failed(val message: String) : CommunityComposerUiState

    /** The server minted the post; the page says so before it navigates. */
    data object Published : CommunityComposerUiState
}
