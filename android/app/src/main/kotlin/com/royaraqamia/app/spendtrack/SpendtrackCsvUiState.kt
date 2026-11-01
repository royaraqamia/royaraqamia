package com.royaraqamia.app.spendtrack

/**
 * What the CSV import is doing (#653).
 *
 * [Busy] is the request in flight: this is the one action on the surface that
 * waits on the server, so it is the one place a spinner is a real state rather
 * than a frame the store resolves.
 */
sealed interface SpendtrackCsvUiState {
    data object Idle : SpendtrackCsvUiState

    data object Busy : SpendtrackCsvUiState
}
