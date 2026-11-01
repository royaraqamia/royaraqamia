package com.royaraqamia.app.spendtrack

/**
 * What the category form is doing (#653).
 *
 * The same pair as the expense form's, for the same reason: [Busy] is the frame
 * between the tap and the commit, and the site's button draws it too — a button
 * that shows nothing while the write is happening is a button a user taps twice.
 */
sealed interface SpendtrackCategoryFormUiState {
    data object Idle : SpendtrackCategoryFormUiState

    data object Busy : SpendtrackCategoryFormUiState
}
