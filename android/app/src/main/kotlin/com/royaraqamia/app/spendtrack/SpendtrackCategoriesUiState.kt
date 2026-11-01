package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow

/**
 * What the category list is showing (#653).
 *
 * The same two states as the expense list, for the same reason: the store
 * answers synchronously, so a loading face would describe a wait the user is not
 * in. [Empty] is the site's empty state, in the site's words.
 */
sealed interface SpendtrackCategoriesUiState {
    data class Painted(val rows: List<SpendtrackCategoryRow>) : SpendtrackCategoriesUiState

    data object Empty : SpendtrackCategoriesUiState

    companion object {
        fun of(rows: List<SpendtrackCategoryRow>): SpendtrackCategoriesUiState =
            if (rows.isEmpty()) Empty else Painted(rows)
    }
}
