package com.royaraqamia.app.spendtrack

/**
 * What the category ring is showing (#653).
 *
 * Two states, the pair every list in this app has: the store answers
 * synchronously, so there is no loading face, and a window with no expenses is
 * the site's own empty card rather than an empty ring.
 */
sealed interface SpendtrackCategoryChartUiState {
    data class Painted(val slices: List<CategoryTotal>) : SpendtrackCategoryChartUiState

    data object Empty : SpendtrackCategoryChartUiState

    companion object {
        fun of(slices: List<CategoryTotal>): SpendtrackCategoryChartUiState =
            if (slices.isEmpty()) Empty else Painted(slices)
    }
}
