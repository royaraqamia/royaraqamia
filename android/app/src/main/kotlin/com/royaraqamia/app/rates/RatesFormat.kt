package com.royaraqamia.app.rates

import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.CurrencySymbols
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A converted figure and a quote day, as the site writes them (#658).
 *
 * `frontend/ui/rates/rate-format.tsx` formats the figure with
 * `Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })`, which is
 * `en-US` grouping in ASCII digits — the same shape [com.royaraqamia.app.spendtrack.SpendtrackMoney]
 * already writes for an amount, so a member reads `13,800` on both clients rather
 * than Arabic-Indic numerals in a figure the site draws as ASCII (ADR-0054).
 *
 * The day is the one the page prints next to "آخر تحديث": the Umm al-Qura sentence
 * [PlanDates] already produces, then the Gregorian day in the site's `d MMMM y م`
 * shape. The site takes the short month from `Intl`; the app takes the long one,
 * because Arabic month names are the same word in both lengths — the divergence is
 * named here rather than hidden.
 */
object RatesFormat {
    /** Old lira per new lira, the site's `OLD_SYP_PER_NEW_SYP`. */
    const val OLD_SYP_PER_NEW_SYP = 100.0

    private val grouping = DecimalFormat("#,##0", DecimalFormatSymbols(Locale.US))
    private val gregorianPattern: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("ar"))

    private val dayOnly = Regex("""^\d{4}-\d{2}-\d{2}$""")

    /** A rate or a converted amount, as a grouped figure with no decimals. */
    fun value(number: Double): String = grouping.format(number)

    /** The currency a result is labelled with: SYP is the new lira, by the caller. */
    fun symbol(code: String): String =
        CurrencySymbols.byCode[code]?.symbol ?: CurrencySymbols.byCode.getValue(CurrencySymbols.DEFAULT).symbol

    /** The board's quote day as the Hijri sentence, or the raw value when unreadable. */
    fun hijri(day: String): String = PlanDates.labelDay(day)

    /** The board's quote day in the site's Gregorian shape: `12 نوفمبر 2026 م`. */
    fun gregorian(day: String): String {
        val parsed = runCatching { LocalDate.parse(day) }.getOrElse { return day }
        return "${gregorianPattern.format(parsed)} م"
    }

    /** Whether a stored date is a calendar day rather than an instant. */
    fun isDayOnly(value: String): Boolean = dayOnly.matches(value)
}
