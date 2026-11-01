package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackRecurringRow

/**
 * What the recurring-expenses list is showing (#653).
 *
 * The same two states as the other lists: the store answers synchronously, so a
 * loading face would describe a wait the user is not in. [Empty] is the site's
 * empty card, in the site's words.
 */
sealed interface SpendtrackRecurringUiState {
    data class Painted(val rows: List<SpendtrackRecurringRow>) : SpendtrackRecurringUiState

    data object Empty : SpendtrackRecurringUiState

    companion object {
        fun of(rows: List<SpendtrackRecurringRow>): SpendtrackRecurringUiState =
            if (rows.isEmpty()) Empty else Painted(rows)
    }
}
