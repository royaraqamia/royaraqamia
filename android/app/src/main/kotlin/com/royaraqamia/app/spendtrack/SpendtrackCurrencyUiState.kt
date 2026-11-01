package com.royaraqamia.app.spendtrack

/**
 * What the account-currency control is showing (#653).
 *
 * One state: the control always has a currency to name — the account's, or the
 * site's default before one is chosen. The spinner the site draws while a change
 * is in flight is not a state a caller reads, so it is not declared here.
 */
sealed interface SpendtrackCurrencyUiState {
    data object Ready : SpendtrackCurrencyUiState
}
