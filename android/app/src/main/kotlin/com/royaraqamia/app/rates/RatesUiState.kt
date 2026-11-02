package com.royaraqamia.app.rates

import com.royaraqamia.app.contracts.generated.RatesBoard

/**
 * What the rates screen is showing (#658).
 *
 * The site is one server-rendered page, so its "states" are the ones the server
 * happened to answer with: a board, a stale board, or nothing. The app has the same
 * three and one more face — a *snapshot*, the last board it read — because the
 * matrix promises a snapshot for `/rates` and the screen has to say so rather than
 * pass yesterday off as today.
 *
 * The loading face is deliberately not a state here: it is "null", drawn as the
 * recipe's skeleton, because there is no sentence to say while nothing is known and
 * a fourth copy key for it would be a string the site never renders.
 */
sealed interface RatesUiState {
    /** The board the server answered just now. */
    data class Live(val board: RatesBoard) : RatesUiState

    /** The last board this device read, because this read failed. */
    data class Snapshot(val board: RatesBoard) : RatesUiState

    /** Nothing to show: no answer, and nothing kept. */
    data object Unavailable : RatesUiState
}
