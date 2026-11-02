package com.royaraqamia.app.rates

/**
 * Whether the gold and silver card has a figure to show (#658).
 *
 * It is its own interface rather than a reuse of [RatesConverterState] because the
 * two cards are two rows in `docs/mobile/parity.json`, and a row's states are read
 * from its own file: sharing one interface would make a state added to the metals
 * card look like a state added to the converter.
 */
sealed interface RatesMetalsState {
    /** A conversion the board can price, with the metal's karat applied where it has one. */
    data object Ready : RatesMetalsState

    /** A metal the board does not quote, or an amount that is not a number. */
    data object NoConversion : RatesMetalsState
}
