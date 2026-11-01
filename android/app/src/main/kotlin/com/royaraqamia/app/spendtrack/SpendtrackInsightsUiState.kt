package com.royaraqamia.app.spendtrack

/**
 * What the insights strip is showing (#653).
 *
 * One state: the strip is computable from the rows the store already holds, so
 * there is no wait to draw. A window with no expenses still answers — the
 * average is zero and the top category is absent, which the strip says in the
 * site's words rather than by disappearing.
 */
sealed interface SpendtrackInsightsUiState {
    data object Ready : SpendtrackInsightsUiState
}
