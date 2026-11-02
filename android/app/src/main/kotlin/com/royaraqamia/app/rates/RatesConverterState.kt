package com.royaraqamia.app.rates

/**
 * Whether the converter has a figure to show (#658).
 *
 * The site draws one of two things in its result box: the converted amount, or
 * `تعذَّر التَّحويل بين هذين العنصرين.` when the board cannot price one side of the
 * pair — a currency the board does not quote, or an amount that is not a number.
 * Both clients decide it from the same arithmetic ([RatesMath]), so the state is a
 * value the card is handed rather than a second opinion inside it.
 */
sealed interface RatesConverterState {
    /** A conversion the board can price. */
    data object Ready : RatesConverterState

    /** A pair, or an amount, the board cannot price. */
    data object NoConversion : RatesConverterState
}
