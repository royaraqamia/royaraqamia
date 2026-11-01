package com.royaraqamia.app.spendtrack

/**
 * What the total card is showing (#653).
 *
 * One state, and it is not an accident: a total is drawn from the store the
 * frame the screen opens, so there is no loading face, and zero is a figure the
 * site draws rather than an absence. A card that had an "empty" state would have
 * to invent a moment the app is never in.
 */
sealed interface SpendtrackTotalUiState {
    data object Ready : SpendtrackTotalUiState
}
