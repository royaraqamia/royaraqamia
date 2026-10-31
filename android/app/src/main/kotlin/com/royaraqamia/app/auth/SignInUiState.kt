package com.royaraqamia.app.auth

import com.royaraqamia.app.session.SignInOutcome

/**
 * What the sign-in card is doing (#770).
 *
 * Four answers, and the two that matter are the failure ones: a wrong password is
 * something the user can fix in place, and a network that never answered is not —
 * the site tells them apart too (`app/auth/login/page.tsx` renders the server's
 * message for the first and a needs-connection line for the second), so the app
 * reuses that vocabulary instead of flattening both into "فشل".
 *
 * [Idle] is the state the button's own label is drawn in, which is why it is a
 * state rather than "no state": a screen that declares its resting face can be
 * held against the site's.
 */
sealed interface SignInUiState {
    data object Idle : SignInUiState

    data object Busy : SignInUiState

    /** Credentials the server did not accept; the form stays filled in. */
    data object Refused : SignInUiState

    /** The question was never answered: no radio, a timeout, a 5xx. */
    data object Unreachable : SignInUiState

    companion object {
        /** One attempt, as the screen sees it. */
        fun of(outcome: SignInOutcome): SignInUiState =
            when (outcome) {
                is SignInOutcome.SignedIn -> Idle
                SignInOutcome.Refused -> Refused
                is SignInOutcome.Unreachable -> Unreachable
            }
    }
}
