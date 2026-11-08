package com.royaraqamia.app.news

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * A digest day as the page's archive strip writes it (#926).
 *
 * The site uses `Intl.DateTimeFormat('ar-SY-u-nu-latn', { day, month })` over the
 * stored `YYYY-MM-DD` date, read in UTC because the column is a plain date. The
 * app reads the same day as a [LocalDate], so a device west of UTC cannot print
 * the day before, and keeps the digits ASCII (ADR-0054).
 */
object NewsFormat {
    private val dayShort: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMMM", Locale.forLanguageTag("ar"))
            .withDecimalStyle(DecimalStyle.STANDARD)

    /** The site's `formatCount`: en-US grouping in ASCII digits. */
    private val grouping = DecimalFormat("#,##0", DecimalFormatSymbols(Locale.US))

    /** `2026-11-08` as `8 نوفمبر`, or the raw value when it is not a calendar day. */
    fun archiveDay(day: String): String {
        val parsed = runCatching { LocalDate.parse(day) }.getOrElse { return day }
        return dayShort.format(parsed)
    }

    /** A card count, as the page's `formatCount` writes it. */
    fun count(value: Long): String = grouping.format(value)
}
