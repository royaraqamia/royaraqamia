package com.royaraqamia.app.community

/**
 * What the community editor's status line is saying (#925).
 *
 * The four faces are the site's own save states rather than a generic spinner:
 * at rest every edit has reached the device (and, when online, the server), a
 * draft is text the server has not accepted yet, saving is the moment between,
 * and a failure names the refusal. The store answers synchronously, so there is
 * no loading face to draw — a skeleton would be a lie about where the words come
 * from.
 *
 * Kept a sealed interface so `docs/mobile/parity.json` can hold the editor's four
 * states against the website's, and `check:parity` fails one the other side does
 * not draw.
 */
sealed interface CommunityEditorUiState {
    /** Every edit has reached the device (and, when online, the server). */
    data object AtRest : CommunityEditorUiState

    /** The text is on the device and the Outbox has not delivered it yet. */
    data object Draft : CommunityEditorUiState

    /** A write is in flight. */
    data object Saving : CommunityEditorUiState

    /** The last save could not be committed, or the server refused it. */
    data class Failed(val message: String) : CommunityEditorUiState
}
