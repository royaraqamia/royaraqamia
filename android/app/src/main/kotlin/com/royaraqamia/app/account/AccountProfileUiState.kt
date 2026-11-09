package com.royaraqamia.app.account

/**
 * Which of the card's own faces is drawn (#946).
 *
 * `ProfileEditor` on the page owns exactly these four: the card at rest, the
 * name dialog, the avatar dialog and the question before the picture is
 * removed. Keeping them a sealed interface is what lets
 * `docs/mobile/parity.json` hold the app's faces against the page's and
 * `check:parity` fail one the other client does not draw.
 */
sealed interface AccountProfileUiState {
    /** The card at rest: the avatar, the name, the pencil and the email. */
    data object AtRest : AccountProfileUiState

    /** The name dialog is open, with its field and its save action. */
    data object EditingName : AccountProfileUiState

    /** The avatar dialog is open: the large picture, the limit and the actions. */
    data object EditingAvatar : AccountProfileUiState

    /** The avatar dialog's destructive question is open. */
    data object ConfirmingRemoval : AccountProfileUiState
}
