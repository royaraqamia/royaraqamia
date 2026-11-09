package com.royaraqamia.app.assistant

/**
 * The faces the floating assistant can wear (ADR-0143).
 *
 * They are the server's answers, not the screen's guesses: a guest has not
 * signed in, a plan may allow no turn, a deployment may have no provider key,
 * and the conversation itself is either loading, failed or ready. The prose for
 * each is `AssistantPanelCopy`, the same file the site's panel reads.
 *
 * The states are the parity row's list (`docs/mobile/parity.json`); adding one
 * means adding its sentence on both sides.
 */
sealed interface AssistantUiState {
    /** Signed out: the invitation, never a composer that would refuse. */
    data object Guest : AssistantUiState

    /** Signed in on a plan with no assistant turn. */
    data object Locked : AssistantUiState

    /** No provider key on this deployment. */
    data object Unavailable : AssistantUiState

    /** Opening the thread, or reading its newest page. */
    data object Loading : AssistantUiState

    /** The open or the read did not answer. */
    data object Failed : AssistantUiState

    /** The conversation is on screen and can be written to. */
    data object Ready : AssistantUiState

    /** A turn is in flight; the answer is arriving. */
    data object Asking : AssistantUiState
}
