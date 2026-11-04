package com.royaraqamia.app.account

/**
 * Who is reading the account screen (#948).
 *
 * The rows are public, so a guest sees the same list as a member; the difference
 * is the sign-out control, which only a member can use. The page decides this
 * from its session, and the shell hands the same answer here.
 */
sealed interface AccountUiState {
    /** No session: every row still opens the document's own sign-in prompt. */
    data object Guest : AccountUiState

    /** A session is in force, so the account's rows and its sign-out are drawn. */
    data object Member : AccountUiState

    companion object {
        fun of(signedIn: Boolean): AccountUiState = if (signedIn) Member else Guest
    }
}
