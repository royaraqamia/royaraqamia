package com.royaraqamia.app.accountnews

/**
 * The proposal form's four states (#950).
 *
 * [Failed] carries the server's sentence, because a refused link says why, and
 * the form keeps what was typed while it does — the page's toast does the same.
 * [Submitted] is the inline success line the page shows as a toast.
 */
sealed interface NewsSourceRequestUiState {
    data object Idle : NewsSourceRequestUiState

    data object Submitting : NewsSourceRequestUiState

    data class Failed(val message: String) : NewsSourceRequestUiState

    data object Submitted : NewsSourceRequestUiState
}
