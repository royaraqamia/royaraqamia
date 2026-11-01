package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow

/**
 * What the expense list is showing (#653).
 *
 * Two states, because the store answers synchronously: there is no loading face
 * to draw, and a skeleton would be a lie about where the rows come from. [Empty]
 * is the site's own empty state, in the site's own words.
 *
 * A "needs connection" state is not one of these: the list never waits for the
 * server. What the *sync* is doing is the pill beside it
 * ([com.royaraqamia.app.sync.SyncPillState]), which is where the site draws it too.
 */
sealed interface SpendtrackExpensesUiState {
    data class Painted(val rows: List<SpendtrackExpenseRow>) : SpendtrackExpensesUiState

    data object Empty : SpendtrackExpensesUiState

    companion object {
        fun of(rows: List<SpendtrackExpenseRow>): SpendtrackExpensesUiState =
            if (rows.isEmpty()) Empty else Painted(rows)
    }
}
