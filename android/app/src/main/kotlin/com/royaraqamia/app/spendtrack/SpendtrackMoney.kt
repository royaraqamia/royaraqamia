package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.shared.CurrencySymbols
import java.math.BigDecimal
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * An amount as the site writes it (ADR-0098).
 *
 * `shared/currency.ts` formats with `Intl.NumberFormat('ar-SA-u-nu-latn', {
 * minimumFractionDigits: 2, maximumFractionDigits: 2 })` and puts the symbol
 * before or after the figure by the currency's own `position`. So a member reads
 * the same number on both clients: two decimals always, `en-US` grouping, ASCII
 * digits — an Arabic-locale phone must not answer in Arabic-Indic numerals in a
 * figure the site draws as `1,250.00` (ADR-0054).
 *
 * The symbols are generated from the one table (`shared/currency.ts` →
 * [CurrencySymbols]), so a currency added to the site cannot arrive in the app as
 * a missing symbol.
 */
object SpendtrackMoney {
    private val symbols = DecimalFormatSymbols(Locale.US)
    private val format = DecimalFormat("#,##0.00", symbols)

    /** `12.5` USD is `$12.50`; `12.5` SAR is `12.50 ر.س`. */
    fun label(amount: Double, currency: String?): String {
        val info =
            CurrencySymbols.byCode[currency] ?: CurrencySymbols.byCode[CurrencySymbols.DEFAULT]
        // An unknown code with no table at all cannot happen while DEFAULT is in
        // the table; `requireNotNull` would be a crash on a screen for a currency
        // that only needs the code, so the code itself is the fallback.
        val symbol = info?.symbol ?: currency.orEmpty()
        val figure = format.format(BigDecimal.valueOf(amount))
        return if (info?.prefix == true) "$symbol$figure" else "$figure $symbol"
    }
}
