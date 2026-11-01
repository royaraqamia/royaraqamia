package com.royaraqamia.app.spendtrack

/**
 * What the filter bar is showing (#653).
 *
 * One state: the bar always draws, because it filters rows the store already
 * holds. What the *list* is showing after a filter is [SpendtrackExpensesUiState],
 * which has its own empty state — a filter that matches nothing is the site's
 * `لا توجد نتائج تُطابق الفلترة`, not an empty bar.
 */
sealed interface SpendtrackFiltersUiState {
    data object Ready : SpendtrackFiltersUiState
}
