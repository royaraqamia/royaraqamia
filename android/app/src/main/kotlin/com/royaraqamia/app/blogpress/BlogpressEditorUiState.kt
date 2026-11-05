package com.royaraqamia.app.blogpress

/**
 * What the BlogPress editor's status line is saying (#954).
 *
 * The four faces are the page's own save states, not a generic spinner: at rest
 * the draft is on the device, an unsent draft is a change the server has not
 * accepted yet, saving is the moment between, and a failure names the refusal.
 * The store answers synchronously, so there is no loading state to draw — a
 * skeleton would be a lie about where the words come from.
 *
 * Kept a sealed interface so `docs/mobile/parity.json` can hold the editor's four
 * states against the website's, and `check:parity` fails one the other side does
 * not draw.
 */
sealed interface BlogpressEditorUiState {
    /** Every edit has reached the device (and, when online, the server). */
    data object AtRest : BlogpressEditorUiState

    /** The text is on the device and the Outbox has not delivered it yet. */
    data object Draft : BlogpressEditorUiState

    /** A write is in flight. */
    data object Saving : BlogpressEditorUiState

    /** The last save could not be committed, or the server refused it. */
    data class Failed(val message: String) : BlogpressEditorUiState
}
