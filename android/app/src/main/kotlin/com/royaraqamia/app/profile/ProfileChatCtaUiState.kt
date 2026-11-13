package com.royaraqamia.app.profile

/**
 * Whether the chat door is on a member's profile.
 *
 * The page decides it in the browser: the door is absent on the viewer's own
 * page, because there is nobody to write to. The app decides it in the same
 * place for the same reason — the header draws the door only when the standing
 * is someone else's — and the two names are held against the page's in
 * `docs/mobile/parity.json` so neither client can drop one silently.
 */
sealed interface ProfileChatCtaUiState {
    /** Someone else's profile: the door is drawn beside the follow control. */
    data object Shown : ProfileChatCtaUiState

    /** The viewer's own profile: the control is not drawn at all. */
    data object Hidden : ProfileChatCtaUiState
}
