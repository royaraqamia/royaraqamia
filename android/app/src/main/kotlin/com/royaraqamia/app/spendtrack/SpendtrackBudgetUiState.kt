package com.royaraqamia.app.spendtrack

/**
 * What the budget card is showing (#653).
 *
 * Two states, because the store answers synchronously: there is no loading face
 * to draw. [Unset] is the site's `غير مُحدَّدَة` — a month with no budget is a
 * card that offers the form, not an empty box.
 */
sealed interface SpendtrackBudgetUiState {
    data object Unset : SpendtrackBudgetUiState

    data class Set(val budget: Double) : SpendtrackBudgetUiState

    companion object {
        fun of(budget: Double?): SpendtrackBudgetUiState =
            if (budget == null) Unset else Set(budget)
    }
}
