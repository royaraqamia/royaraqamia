package com.royaraqamia.app.spendtrack

/**
 * What the expense form is doing (#653).
 *
 * [Busy] is the frame between the tap and the commit: the row and its replay
 * intent land in one transaction, so it is short — but it is the state the
 * site's button draws too, and a button that shows nothing while the write is
 * happening is a button a user taps twice.
 */
sealed interface SpendtrackExpenseFormUiState {
    data object Idle : SpendtrackExpenseFormUiState

    data object Busy : SpendtrackExpenseFormUiState
}
