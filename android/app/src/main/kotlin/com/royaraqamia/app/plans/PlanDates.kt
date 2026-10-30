package com.royaraqamia.app.plans

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.chrono.HijrahChronology
import java.time.chrono.HijrahDate
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * A date as the site reads it (ADR-0098).
 *
 * `frontend/shared/format.ts` formats with `Intl.DateTimeFormat('ar-SA', {
 * calendar: 'islamic-umalqura', numberingSystem: 'latn', month: 'long' })`, so a
 * member reads the Hijri day in ASCII digits. Android's [HijrahDate] is the same
 * Umm al-Qura calendar and [DecimalStyle.STANDARD] is the same ASCII restriction;
 * `shared/fixtures/parity/hijri-dates.json` pins what both produce, so a
 * month-name or calendar difference fails a test on whichever side moved instead
 * of reaching a device.
 */
object PlanDates {
    private val pattern: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("ar"))
            .withChronology(HijrahChronology.INSTANCE)
            .withDecimalStyle(DecimalStyle.STANDARD)

    /** The site's era marker; `ar-SA` appends it to a Hijri year. */
    private const val ERA = " هـ"

    /**
     * An ISO instant as `23 شعبان 1448 هـ`.
     *
     * The date is resolved in the device's zone, because that is the day the
     * member is living in — the same choice the site's `Intl` call makes. A string
     * that is not an instant is shown as it came rather than blanked.
     */
    fun label(iso: String): String {
        val local = runCatching { ZonedDateTime.ofInstant(Instant.parse(iso), ZoneId.systemDefault()) }
            .getOrElse { return iso }
        return pattern.format(HijrahDate.from(local)) + ERA
    }
}
