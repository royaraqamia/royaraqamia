package com.royaraqamia.app.plans

import java.math.BigDecimal
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * An amount as the site writes it (ADR-0098).
 *
 * `frontend/ui/account/plan-view.tsx` formats with
 * `toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
 * maximumFractionDigits: 2 })` and prefixes `$` for dollars, so a member reads the
 * same figure on both clients. The grouping is pinned to en-US for the same reason
 * the counts are ([UsageCopy]): an Arabic-locale phone must not answer in a second
 * numbering system, and the amount's separators must match the count's.
 */
object PlanMoney {
    private val symbols = DecimalFormatSymbols(Locale.US)
    private val whole = DecimalFormat("#,##0", symbols)
    private val fractional = DecimalFormat("#,##0.00", symbols)

    /**
     * `1200` USD is `$12`; `1250` USD is `$12.50`; a currency that is not the
     * dollar trails the figure (`50 SYP`), which is the site's own choice.
     */
    fun label(amountCents: Long, currency: String): String {
        val amount = BigDecimal(amountCents).movePointLeft(2)
        val format = if (amountCents % 100 == 0L) whole else fractional
        val figure = format.format(amount)

        return if (currency == "USD") "$" + figure else "$figure $currency"
    }
}
