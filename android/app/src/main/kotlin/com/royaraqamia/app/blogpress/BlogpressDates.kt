package com.royaraqamia.app.blogpress

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.chrono.HijrahChronology
import java.time.chrono.HijrahDate
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * The dates the posts list prints, in the site's own calendar and digits (#952).
 *
 * `post-list.tsx` formats with `Intl.DateTimeFormat('ar-SA-u-nu-latn', {
 * calendar: 'islamic-umalqura' })` and numeric fields: a day for a published or
 * edited post, and the same day with a time for a scheduled one. Android's
 * [HijrahDate] is the same Umm al-Qura calendar and [DecimalStyle.STANDARD] is
 * the same ASCII restriction, so a device cannot print Arabic-Indic digits in a
 * list the site prints in Latin ones.
 *
 * The date is resolved in the device's zone, because that is the day the member
 * is living in — the same choice the site's `Intl` call makes. A string that is
 * not an instant is shown as it came rather than blanked.
 */
object BlogpressDates {
    private val day: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.forLanguageTag("ar"))
            .withChronology(HijrahChronology.INSTANCE)
            .withDecimalStyle(DecimalStyle.STANDARD)

    private val dayAndTime: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", Locale.forLanguageTag("ar"))
            .withChronology(HijrahChronology.INSTANCE)
            .withDecimalStyle(DecimalStyle.STANDARD)

    /** `23/08/1447`: a published or edited post's day. */
    fun dayLabel(iso: String): String = format(day, iso)

    /** `23/08/1447 14:30`: the day a scheduled post is due. */
    fun dayAndTimeLabel(iso: String): String = format(dayAndTime, iso)

    private fun format(formatter: DateTimeFormatter, iso: String): String {
        val local =
            runCatching { ZonedDateTime.ofInstant(Instant.parse(iso), ZoneId.systemDefault()) }
                .getOrElse { return iso }
        return formatter.format(HijrahDate.from(local))
    }
}
