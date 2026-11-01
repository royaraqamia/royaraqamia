package com.royaraqamia.app.spendtrack

/**
 * What the daily bars are showing (#653).
 *
 * Two states, for the same reason as the ring: the rows are already on disk, and
 * a window with no expenses is the site's empty card rather than an axis with
 * nothing on it.
 */
sealed interface SpendtrackDailyChartUiState {
    data class Painted(val bars: List<DailyTotal>) : SpendtrackDailyChartUiState

    data object Empty : SpendtrackDailyChartUiState

    companion object {
        fun of(bars: List<DailyTotal>): SpendtrackDailyChartUiState =
            if (bars.isEmpty()) Empty else Painted(bars)
    }
}
